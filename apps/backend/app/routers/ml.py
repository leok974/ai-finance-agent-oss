from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import Any, Dict, List
from app.db import get_db
from app.orm_models import Transaction, Feedback
from app.services.ml_suggest import suggest_for_unknowns
from app.services.ml_train import incremental_update

router = APIRouter()

@router.get("/ml/status")
def ml_status(db: Session = Depends(get_db)) -> Dict[str, Any]:
    info: Dict[str, Any] = {"ok": True}
    # Add lightweight metrics; keep resilient
    try:
        info["feedback_count"] = int(db.query(Feedback).count())
    except Exception:
        info["feedback_count"] = None
    return info

@router.get("/ml/suggest")
def ml_suggest(
    limit: int = 50,
    topk: int = 3,
    month: str | None = None,
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    # debug prints removed
    # Define "unlabeled": None, empty string, or literal "Unknown" (case-insensitive)
    unlabeled_cond = (
        (Transaction.category.is_(None)) |
        (func.trim(Transaction.category) == "") |
        (func.lower(Transaction.category) == "unknown")
    )

    # Build base query and (optionally) month filter
    base_q = db.query(Transaction.id).filter(unlabeled_cond)
    if month:
        base_q = base_q.filter(Transaction.month == month)

    # Compute the authoritative set of unlabeled txn IDs for this month
    unlabeled_ids = {row[0] for row in base_q.all()}
    # Optional debug: show the set of unlabeled txn IDs
    # debug prints removed

    # If none, return empty immediately (this is what the test expects)
    if not unlabeled_ids:
        return {"month": month, "suggestions": []}

    # Ask the service for suggestions (could be noisy; we’ll filter strictly)
    raw: List[Dict[str, Any]] = suggest_for_unknowns(db, month=month, limit=limit, topk=topk)

    # Keep only items that:
    #  1) refer to a txn_id that is in our unlabeled set, and
    #  2) actually have candidates/topk to show
    def has_candidates(item: Dict[str, Any]) -> bool:
        cands = item.get("candidates") or item.get("topk") or []
        return bool(cands)

    cleaned = [
        it for it in raw
        if it.get("txn_id") in unlabeled_ids and has_candidates(it)
    ]

    return {"month": month, "suggestions": cleaned}


# ---------- Feedback + Incremental Update ----------
class FeedbackIn(BaseModel):
    txn_id: int
    label: str
    source: str = "user_change"
    notes: str | None = None


@router.post("/ml/feedback")
def record_feedback(payload: FeedbackIn, db: Session = Depends(get_db)):
    # 1) fetch transaction to build text feature
    txn = db.query(Transaction).filter(Transaction.id == payload.txn_id).first()
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found")

    text_parts = [txn.merchant or "", txn.description or ""]
    # optional: include amount as text for incremental context
    try:
        text_parts.append(f"{float(txn.amount or 0.0):.2f}")
    except Exception:
        pass
    text = " ".join([p for p in text_parts if p]).strip()

    # 2) store feedback row
    fb = Feedback(
        txn_id=payload.txn_id,
        label=payload.label,
        source=payload.source,
        notes=payload.notes,
    )
    db.add(fb)
    db.commit()

    # 3) best-effort incremental update
    try:
        upd = incremental_update([text], [payload.label])
    except Exception as e:
        upd = {"updated": False, "error": str(e)}

    return {"ok": True, "updated": bool(upd.get("updated")), "detail": upd}
