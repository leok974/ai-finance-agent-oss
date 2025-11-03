"""Agent tools for smart categorization suggestions and application."""

from pydantic import BaseModel
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from app.db import get_db
from app.services.categorize_suggest import suggest_categories_for_txn
from app.orm_models import Transaction, MerchantCategoryHint, CategoryRule
import re

router = APIRouter()


class SuggestBody(BaseModel):
    txn_id: int | None = None
    merchant: str | None = None
    description: str | None = None
    amount: float | None = None


class SuggestBatchBody(BaseModel):
    txn_ids: list[int]


class PromoteBody(BaseModel):
    category_slug: str
    # EITHER: explicit regex pattern …
    pattern: str | None = None
    # … OR merchant to auto-generate a safe regex (preferred UX)
    merchant_canonical: str | None = None
    priority: int = 50
    enabled: bool = True


@router.post("/agent/tools/categorize/suggest")
def categorize_suggest(body: SuggestBody, db: Session = Depends(get_db)):
    """
    Get ranked category suggestions for a transaction.

    Provide either txn_id to suggest for existing transaction,
    or merchant + amount to suggest for new transaction.
    """
    if body.txn_id is not None:
        txn = db.query(Transaction).filter_by(id=body.txn_id).first()
        if not txn:
            raise HTTPException(404, "transaction not found")
        payload = {
            "merchant": txn.merchant,
            "description": txn.description,
            "amount": float(txn.amount),
            "merchant_canonical": getattr(txn, "merchant_canonical", None),
            # Optional: cadence heuristic, fill if you track it
        }
    else:
        if body.merchant is None or body.amount is None:
            raise HTTPException(400, "merchant and amount required when txn_id absent")
        payload = body.model_dump()

    suggestions = suggest_categories_for_txn(payload, db=db)
    return {"txn": body.txn_id, "suggestions": suggestions}


@router.post("/agent/tools/categorize/suggest/batch")
def categorize_suggest_batch(body: SuggestBatchBody, db: Session = Depends(get_db)):
    """
    Get ranked category suggestions for multiple transactions in batch.

    More efficient than calling suggest endpoint multiple times.
    """
    if not body.txn_ids:
        return {"items": []}

    # Pull all transactions at once
    txns = db.query(Transaction).filter(Transaction.id.in_(body.txn_ids)).all()

    out = []
    for t in txns:
        payload = {
            "merchant": t.merchant,
            "description": t.description,
            "amount": float(t.amount),
            "merchant_canonical": getattr(t, "merchant_canonical", None),
        }
        suggestions = suggest_categories_for_txn(payload, db=db)
        out.append({"txn": t.id, "suggestions": suggestions})

    return {"items": out}


def _safe_regex_from_merchant(mc: str) -> str:
    """Escape merchant name and allow flexible spacing/dashes."""
    mc = (mc or "").strip()
    esc = re.sub(r"\s+", r"\\s*", re.escape(mc))
    return esc


@router.post("/agent/tools/categorize/promote")
def categorize_promote(body: PromoteBody, db: Session = Depends(get_db)):
    """
    Promote a merchant → category mapping to a reusable rule (admin).

    Creates a regex pattern rule that will apply to all future transactions
    matching the pattern. Also updates/creates a hint for immediate learning.
    """
    pattern = body.pattern
    if not pattern and body.merchant_canonical:
        pattern = _safe_regex_from_merchant(body.merchant_canonical.lower())

    if not pattern:
        raise HTTPException(400, "pattern or merchant_canonical required")

    # Check if rule already exists
    existing = (
        db.query(CategoryRule)
        .filter(
            CategoryRule.pattern == pattern,
            CategoryRule.category_slug == body.category_slug,
        )
        .first()
    )
    if existing:
        # Update priority/enabled
        existing.priority = body.priority
        existing.enabled = body.enabled
    else:
        db.add(
            CategoryRule(
                pattern=pattern,
                category_slug=body.category_slug,
                priority=body.priority,
                enabled=body.enabled,
            )
        )

    # Seed/update a hint so non-regex paths also learn
    if body.merchant_canonical:
        hint = (
            db.query(MerchantCategoryHint)
            .filter_by(
                merchant_canonical=body.merchant_canonical.lower(),
                category_slug=body.category_slug,
            )
            .first()
        )
        if hint:
            hint.source = "user"
            hint.confidence = max(hint.confidence, 0.9)
        else:
            db.add(
                MerchantCategoryHint(
                    merchant_canonical=body.merchant_canonical.lower(),
                    category_slug=body.category_slug,
                    source="user",
                    confidence=0.9,
                )
            )

    db.commit()
    return {
        "ok": True,
        "ack": f"Promoted to rule `{pattern}` → {body.category_slug} (p{body.priority}).",
    }


class FeedbackBody(BaseModel):
    merchant_canonical: str
    category_slug: str
    action: str  # currently supports: "reject" (aka Don't suggest this)


@router.post("/agent/tools/categorize/feedback")
def categorize_feedback(body: FeedbackBody, db: Session = Depends(get_db)):
    """
    Record feedback for categorization suggestions.

    Currently supports action="reject" to indicate a category should not be
    suggested for a given merchant. This persists as a user_block hint and is
    respected by the suggest endpoint.
    """
    action = (body.action or "").lower().strip()
    if action not in {"reject", "dont_suggest", "don't suggest", "block"}:
        raise HTTPException(400, "unsupported feedback action")

    mc = (body.merchant_canonical or "").strip().lower()
    if not mc or not body.category_slug:
        raise HTTPException(400, "merchant_canonical and category_slug required")

    # Upsert a blocking hint (source=user_block). We use confidence=0.0
    # to mark it as non-positive; service will filter by source.
    hint = (
        db.query(MerchantCategoryHint)
        .filter_by(merchant_canonical=mc, category_slug=body.category_slug)
        .one_or_none()
    )
    if hint:
        hint.source = "user_block"
        hint.confidence = min(float(hint.confidence or 0.0), 0.0)
    else:
        db.add(
            MerchantCategoryHint(
                merchant_canonical=mc,
                category_slug=body.category_slug,
                source="user_block",
                confidence=0.0,
            )
        )
    db.commit()
    return {"ok": True}


class FeedbackUndoBody(BaseModel):
    merchant_canonical: str
    category_slug: str


@router.post("/agent/tools/categorize/feedback/undo")
def categorize_feedback_undo(body: FeedbackUndoBody, db: Session = Depends(get_db)):
    """
    Undo a prior "Don't suggest this" feedback for a merchant/category pair.

    This removes the persisted user_block hint so that future suggestions can
    include the category again. The operation is idempotent.
    """
    mc = (body.merchant_canonical or "").strip().lower()
    if not mc or not body.category_slug:
        raise HTTPException(400, "merchant_canonical and category_slug required")

    deleted = 0
    hint = (
        db.query(MerchantCategoryHint)
        .filter_by(merchant_canonical=mc, category_slug=body.category_slug)
        .one_or_none()
    )
    if hint and (hint.source or "") == "user_block":
        db.delete(hint)
        deleted = 1
    # If hint exists but is not a user_block, treat as no-op
    db.commit()
    return {"ok": True, "deleted": deleted}


class ApplyBody(BaseModel):
    category_slug: str


@router.post("/txns/{txn_id}/categorize")
def categorize_apply(txn_id: int, body: ApplyBody, db: Session = Depends(get_db)):
    """
    Apply a category to a transaction and learn from it.

    Updates the transaction's category_slug and creates/updates
    a merchant category hint for future suggestions.
    """
    txn = db.query(Transaction).filter_by(id=txn_id).first()
    if not txn:
        raise HTTPException(404, "transaction not found")

    # Update transaction category
    txn.category = body.category_slug  # Update legacy category field
    # TODO: Add category_slug field if different from category

    # Upsert a user hint for learning
    mc = (txn.merchant_canonical or "").lower()
    if mc:
        hint = (
            db.query(MerchantCategoryHint)
            .filter_by(merchant_canonical=mc, category_slug=body.category_slug)
            .first()
        )
        if hint:
            hint.source = "user"
            hint.confidence = max(hint.confidence, 0.9)
        else:
            db.add(
                MerchantCategoryHint(
                    merchant_canonical=mc,
                    category_slug=body.category_slug,
                    source="user",
                    confidence=0.9,
                )
            )
    db.commit()

    # Train ML model if enabled
    try:
        from app.services.ml_scorer import ml, featurize, ENABLED as ML_ENABLED
        import numpy as np

        if ML_ENABLED:
            x = featurize(txn.merchant or "", txn.description or "", float(txn.amount))
            # Get all category slugs from database

            cats = [
                row[0] for row in db.execute("SELECT slug FROM categories").fetchall()
            ]
            if body.category_slug in cats:
                y = np.array([cats.index(body.category_slug)], dtype=int)
                X = np.array([x])
                ml.partial_fit(X, y, classes=cats)
    except Exception:
        pass  # ML training is best-effort

    return {"ok": True, "ack": f"Categorized as {body.category_slug}."}


@router.get("/categories")
def list_categories(db: Session = Depends(get_db)):
    """Get all available categories."""
    from app.orm_models import Category

    cats = db.query(Category).order_by(Category.slug).all()
    return {
        "categories": [
            {"slug": c.slug, "label": c.label, "parent_slug": c.parent_slug}
            for c in cats
        ]
    }


@router.get("/agent/tools/ml/status")
def ml_status():
    """Get ML scorer status and configuration."""
    import os

    try:
        from app.services.ml_scorer import ENABLED, MODEL_PATH

        return {
            "enabled": ENABLED,
            "path": MODEL_PATH,
            "exists": os.path.exists(MODEL_PATH),
        }
    except ImportError:
        return {
            "enabled": False,
            "path": None,
            "exists": False,
            "error": "ML scorer not available",
        }
