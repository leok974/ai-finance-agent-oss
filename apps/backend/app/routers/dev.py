from fastapi import APIRouter, Depends, Body
from sqlalchemy.orm import Session
from app.db import get_db
from app.transactions import Transaction
from typing import Optional
from datetime import datetime, timezone
from app.orm_models import Feedback
from app.services.rule_suggestions import evaluate_candidate, canonicalize_merchant

router = APIRouter(prefix="/dev", tags=["dev"])


@router.get("/first-txn-id")
def first_txn_id(db: Session = Depends(get_db)):
    r = db.query(Transaction.id).order_by(Transaction.id.asc()).first()
    return {"id": r[0] if r else None}


@router.post("/seed-suggestions")
def seed_suggestions(
    category: str = Body(..., embed=True),
    accepts: int = Body(3, embed=True),
    txn_id: Optional[int] = Body(None, embed=True),
    merchant_override: Optional[str] = Body(None, embed=True),
    db: Session = Depends(get_db),
):
    """
    Posts N 'accept' feedback rows for a single transaction to force a rule suggestion.
    Returns suggestion info if threshold is crossed.
    """
    # Pick a transaction (explicit id or latest)
    if txn_id is None:
        txn = db.query(Transaction).order_by(Transaction.id.desc()).first()
    else:
        txn = db.query(Transaction).filter(Transaction.id == txn_id).first()
    if not txn:
        return {"ok": False, "error": "no transactions found"}

    merchant_src = merchant_override or (txn.merchant or "Unknown")
    mnorm = canonicalize_merchant(merchant_src)

    last_fb_id = None
    for _ in range(max(1, int(accepts))):
        fb = Feedback(
            txn_id=txn.id,
            label=category,      # map category -> label
            source="accept",    # treat source as action
            created_at=datetime.now(timezone.utc),
        )
        db.add(fb)
        db.flush()
        last_fb_id = fb.id

    # Evaluate after the batch
    sugg = evaluate_candidate(db, mnorm, category)
    db.commit()

    return {
        "ok": True,
        "txn_id": txn.id,
        "feedback_last_id": last_fb_id,
        "merchant_norm": mnorm,
        "category": category,
        "suggestion_id": getattr(sugg, "id", None),
    }


@router.post("/uncategorize")
def uncategorize(
    month: Optional[str] = Body(None, embed=True),  # e.g., "2025-09"
    limit: int = Body(10, embed=True),
    db: Session = Depends(get_db),
):
    """
    Sets category=NULL for up to `limit` transactions (optionally within a month).
    Useful to repopulate the ML Suggestions panel.
    """
    q = db.query(Transaction).order_by(Transaction.id.desc())
    if month:
        q = q.filter(Transaction.month == month)
    rows = q.limit(int(limit)).all()
    for r in rows:
        r.category = None
    db.commit()
    return {"ok": True, "updated": len(rows)}
