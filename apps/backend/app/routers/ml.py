from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import Any, Dict, List
from app.db import get_db
from app.orm_models import Transaction
from app.services.ml_suggest import suggest_for_unknowns

router = APIRouter()

@router.get("/ml/suggest")
def ml_suggest(
    limit: int = 50,
    topk: int = 3,
    month: str | None = None,
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    print("[ml_suggest] START month=", month)
    print("[ml_suggest] ROUTE FILE =", __file__)
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
    try:
        print("[ml_suggest] UNLABELED_IDS =", sorted(unlabeled_ids))
    except Exception:
        pass

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
