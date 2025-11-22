from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional  # noqa: F401 (kept for potential future query params)
from enum import Enum
from pydantic import BaseModel
from sqlalchemy import text

from app.db import get_db
from app.transactions import Transaction
from app.deps.auth_guard import get_current_user_id
from app.utils.text import canonicalize_merchant
from app.lib.categories import categoryExists
from app.models.ml_feedback import MlFeedbackEvent

router = APIRouter(prefix="/transactions", tags=["transactions"])


class TransactionStatusFilter(str, Enum):
    """Filter for transaction status (pending vs posted)."""

    all = "all"
    posted = "posted"
    pending = "pending"


@router.get("", response_model=list)
def list_transactions(
    user_id: int = Depends(get_current_user_id),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    status: TransactionStatusFilter = Query(TransactionStatusFilter.all),
    db: Session = Depends(get_db),
):
    query = db.query(Transaction).filter(
        Transaction.user_id == user_id
    )  # ✅ Scope by user

    # Apply status filter
    if status == TransactionStatusFilter.posted:
        query = query.filter(Transaction.pending.is_(False))
    elif status == TransactionStatusFilter.pending:
        query = query.filter(Transaction.pending.is_(True))
    # if status == all → no extra filter

    rows = (
        query.order_by(Transaction.date.desc(), Transaction.id.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return [
        {
            "id": r.id,
            "date": r.date.isoformat() if r.date else None,
            "merchant": r.merchant,
            "description": r.description,
            "amount": r.amount,
            "category": r.category,
            "account": r.account,
            "month": r.month,
            "pending": r.pending,
        }
        for r in rows
    ]


@router.get("/{txn_id}", response_model=dict)
def get_transaction(
    txn_id: int,
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    r = (
        db.query(Transaction)
        .filter(
            Transaction.id == txn_id,
            Transaction.user_id == user_id,  # ✅ Verify ownership
        )
        .first()
    )
    if not r:
        raise HTTPException(status_code=404, detail="transaction not found")
    return {
        "id": r.id,
        "date": r.date.isoformat() if r.date else None,
        "merchant": r.merchant,
        "description": r.description,
        "amount": r.amount,
        "category": r.category,
        "account": r.account,
        "month": r.month,
        "pending": r.pending,
    }


# ============================================================
# Manual Categorization
# ============================================================


class ManualCategorizeScope(str, Enum):
    """Scope for manual categorization operation."""

    JUST_THIS = "just_this"
    SAME_MERCHANT = "same_merchant"
    SAME_DESCRIPTION = "same_description"


class ManualCategorizeRequest(BaseModel):
    """Request to manually categorize a transaction."""

    category_slug: str
    scope: ManualCategorizeScope = ManualCategorizeScope.JUST_THIS


class ManualCategorizeResponse(BaseModel):
    """Response from manual categorization operation."""

    txn_id: int
    category_slug: str
    scope: ManualCategorizeScope
    updated_count: int
    similar_updated: int
    hint_applied: bool


@router.post("/{txn_id}/categorize/manual", response_model=ManualCategorizeResponse)
def manual_categorize_transaction(
    txn_id: int,
    payload: ManualCategorizeRequest,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    """
    Manually set a category on a transaction, and optionally apply
    the same category to similar unknown transactions + hints.

    Scope:
    - just_this: Only update this transaction
    - same_merchant: Update all unknowns from same merchant (merchant_canonical)
    - same_description: Update all unknowns with similar description

    Only touches transactions with category='unknown' (except the target txn).
    Optionally upserts a merchant_category_hint for future suggestions.
    """
    # Validate category
    if not categoryExists(payload.category_slug):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid category_slug: {payload.category_slug}",
        )

    # Load target transaction and verify ownership
    txn = (
        db.query(Transaction)
        .filter(Transaction.id == txn_id, Transaction.user_id == user_id)
        .first()
    )
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found")

    # Update this transaction
    txn.category = payload.category_slug
    # Note: We don't have category_source field, so we rely on category being set
    db.add(txn)

    updated_count = 1
    similar_updated = 0

    # Compute canonical keys for scope matching
    merchant_canonical = txn.merchant_canonical or canonicalize_merchant(
        txn.merchant or ""
    )

    # For description scope, we'd need a canonicalize_description helper
    # For now, use simple lowercased description as proxy
    description_key = (
        (txn.description or "").lower().strip() if txn.description else None
    )

    # Apply scope logic - only update UNKNOWNs
    if payload.scope != ManualCategorizeScope.JUST_THIS:
        query = db.query(Transaction).filter(
            Transaction.user_id == user_id,
            Transaction.id != txn_id,
            Transaction.category == "unknown",
        )

        if payload.scope == ManualCategorizeScope.SAME_MERCHANT:
            query = query.filter(Transaction.merchant_canonical == merchant_canonical)
        elif (
            payload.scope == ManualCategorizeScope.SAME_DESCRIPTION and description_key
        ):
            # Simple description matching - match on lowercased description
            # For production, use a proper canonicalize_description function
            query = query.filter(Transaction.description.ilike(f"%{description_key}%"))

        # Bulk update
        similar_updated = query.update(
            {"category": payload.category_slug},
            synchronize_session=False,
        )
        updated_count += similar_updated

    # Upsert hint when scope is not JUST_THIS
    hint_applied = False
    if payload.scope != ManualCategorizeScope.JUST_THIS and merchant_canonical:
        db.execute(
            text(
                """
                INSERT INTO merchant_category_hints
                    (merchant_canonical, category_slug, source, confidence)
                VALUES
                    (:merchant, :category, :source, :confidence)
                ON CONFLICT (merchant_canonical, category_slug) DO UPDATE
                SET
                    confidence = GREATEST(merchant_category_hints.confidence, EXCLUDED.confidence),
                    source = CASE
                        WHEN merchant_category_hints.source = 'user_block' THEN merchant_category_hints.source
                        ELSE EXCLUDED.source
                    END
                """
            ),
            {
                "merchant": merchant_canonical,
                "category": payload.category_slug,
                "source": "manual_user",
                "confidence": 0.95,
            },
        )
        hint_applied = True

        # Record ML feedback event for bulk categorizations
        # This helps the model learn from manual bulk tagging patterns
        feedback_event = MlFeedbackEvent(
            txn_id=txn_id,
            user_id=str(user_id),
            category=payload.category_slug,
            action="accept",
            source="manual_bulk",
            model=None,
            score=None,
        )
        db.add(feedback_event)

    db.commit()

    return ManualCategorizeResponse(
        txn_id=txn_id,
        category_slug=payload.category_slug,
        scope=payload.scope,
        updated_count=updated_count,
        similar_updated=similar_updated,
        hint_applied=hint_applied,
    )
