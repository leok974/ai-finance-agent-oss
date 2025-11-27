from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional  # noqa: F401 (kept for potential future query params)
from enum import Enum
from pydantic import BaseModel, Field
from sqlalchemy import text
from datetime import date
from decimal import Decimal

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
    demo: bool = Query(False, description="Use demo user data instead of current user"),
    db: Session = Depends(get_db),
):
    from app.core.demo import resolve_user_for_mode

    effective_user_id, include_demo = resolve_user_for_mode(user_id, demo)
    query = db.query(Transaction).filter(
        Transaction.user_id == effective_user_id
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
    demo: bool = Query(False, description="Use demo user data instead of current user"),
    db: Session = Depends(get_db),
):
    from app.core.demo import resolve_user_for_mode

    effective_user_id, include_demo = resolve_user_for_mode(user_id, demo)
    r = (
        db.query(Transaction)
        .filter(
            Transaction.id == txn_id,
            Transaction.user_id == effective_user_id,  # ✅ Verify ownership
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


class ManualCategorizeAffectedTxn(BaseModel):
    """Transaction affected by manual categorization (for undo)."""

    id: int
    date: date
    amount: Decimal
    merchant: str
    previous_category_slug: str
    new_category_slug: str


class ManualCategorizeResponse(BaseModel):
    """Response from manual categorization operation."""

    txn_id: int
    category_slug: str
    scope: ManualCategorizeScope
    updated_count: int
    similar_updated: int
    hint_applied: bool
    affected: list[ManualCategorizeAffectedTxn] = Field(default_factory=list)


class ManualCategorizeUndoRequest(BaseModel):
    """Request to undo a manual categorization operation."""

    affected: list[ManualCategorizeAffectedTxn]


class ManualCategorizeUndoResponse(BaseModel):
    """Response from undo operation."""

    reverted_count: int


@router.post("/categorize/manual/undo", response_model=ManualCategorizeUndoResponse)
def manual_categorize_undo(
    payload: ManualCategorizeUndoRequest,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    """
    Undo a previous manual categorization by reverting affected transactions
    back to their previous categories.

    Only reverts transactions that:
    - Belong to the current user
    - Still have the new_category_slug (haven't been changed again)
    """
    if not payload.affected:
        return ManualCategorizeUndoResponse(reverted_count=0)

    ids = [a.id for a in payload.affected]

    # Load transactions that belong to this user
    txns = (
        db.query(Transaction)
        .filter(
            Transaction.user_id == user_id,
            Transaction.id.in_(ids),
        )
        .all()
    )

    # Index by id for quick lookup of the "before" snapshot
    before_by_id = {a.id: a for a in payload.affected}

    reverted = 0
    for t in txns:
        before = before_by_id.get(t.id)
        if not before:
            continue
        # Only revert if category hasn't changed since the bulk operation
        if t.category != before.new_category_slug:
            continue
        t.category = before.previous_category_slug
        reverted += 1

    if reverted:
        db.commit()

    return ManualCategorizeUndoResponse(reverted_count=reverted)


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
    anchor = (
        db.query(Transaction)
        .filter(Transaction.id == txn_id, Transaction.user_id == user_id)
        .first()
    )
    if not anchor:
        raise HTTPException(status_code=404, detail="Transaction not found")

    # Compute canonical keys for scope matching
    merchant_canonical = anchor.merchant_canonical or canonicalize_merchant(
        anchor.merchant or ""
    )

    # For description scope, use simple lowercased description
    description_key = (
        (anchor.description or "").lower().strip() if anchor.description else None
    )

    # Build query for transactions to update
    query = db.query(Transaction).filter(Transaction.user_id == user_id)

    if payload.scope == ManualCategorizeScope.JUST_THIS:
        # For just_this scope, update the specific transaction regardless of current category
        query = query.filter(Transaction.id == txn_id)
    elif payload.scope == ManualCategorizeScope.SAME_MERCHANT:
        # For bulk scopes, only touch unknown transactions
        query = query.filter(
            Transaction.category == "unknown",
            Transaction.merchant_canonical == merchant_canonical,
        )
    elif payload.scope == ManualCategorizeScope.SAME_DESCRIPTION and description_key:
        # For bulk scopes, only touch unknown transactions
        query = query.filter(
            Transaction.category == "unknown",
            Transaction.description.ilike(f"%{description_key}%"),
        )

    # Snapshot BEFORE we update
    to_update: list[Transaction] = query.all()
    if not to_update:
        return ManualCategorizeResponse(
            txn_id=txn_id,
            category_slug=payload.category_slug,
            scope=payload.scope,
            updated_count=0,
            similar_updated=0,
            hint_applied=False,
            affected=[],
        )

    # Build affected list from snapshots
    affected = [
        ManualCategorizeAffectedTxn(
            id=t.id,
            date=t.date,
            amount=t.amount,
            merchant=t.merchant or "",
            previous_category_slug=t.category,
            new_category_slug=payload.category_slug,
        )
        for t in to_update
    ]

    # Apply update
    for t in to_update:
        t.category = payload.category_slug

    updated_count = len(to_update)
    similar_updated = max(0, updated_count - 1)

    # Upsert hint when scope is not JUST_THIS
    hint_applied = False
    if payload.scope != ManualCategorizeScope.JUST_THIS and merchant_canonical:
        # Only create hints for real user data, not demo transactions
        is_demo_transaction = getattr(anchor, "is_demo", False)

        if not is_demo_transaction:
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
            # Only create feedback events for real user data (not demo)
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
        affected=affected,
    )
