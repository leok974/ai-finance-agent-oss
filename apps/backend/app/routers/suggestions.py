from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import Optional

from app.db import get_db
from app.utils.csrf import csrf_protect
from app.utils.auth import get_current_user
from app.orm_models import Transaction
from app.services.ack_service import build_ack

router = APIRouter(prefix="/suggestions", tags=["suggestions"])

class AcceptSuggestionBody(BaseModel):
    txn_id: int
    category: str
    apply_to_similar: bool = False

@router.post("/accept", status_code=status.HTTP_200_OK, dependencies=[Depends(csrf_protect)])
def accept_suggestion(
    body: AcceptSuggestionBody,
    db: Session = Depends(get_db),
    user = Depends(get_current_user),
):
    """
    Accept a mined/model suggestion for a single transaction, optionally updating similar items by merchant.
    Returns a friendly acknowledgment (ack) for the UI.
    """
    txn = db.get(Transaction, body.txn_id)
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found")

    # 1) Deterministic persist
    txn.category = body.category
    updated_count = 1

    if body.apply_to_similar:
        mcanon = (txn.merchant_canonical or (txn.merchant or "").strip().lower())
        if mcanon:
            updated_count += (
                db.query(Transaction)
                .filter(Transaction.merchant_canonical == mcanon, Transaction.id != txn.id)
                .update({Transaction.category: body.category}, synchronize_session=False)
            )

    db.commit()

    # 2) Friendly ack (LLM-polished; deterministic fallback)
    scope = "similar" if body.apply_to_similar else "future"
    ack = build_ack(
        merchant=txn.merchant,
        category=body.category,
        updated_count=(updated_count if body.apply_to_similar else None),
        scope=scope,
    )

    return {"ok": True, "txn_id": body.txn_id, "updated": int(updated_count), "ack": ack}
