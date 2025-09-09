from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.db import get_db
from app.transactions import Transaction

router = APIRouter(prefix="/dev", tags=["dev"])


@router.get("/first-txn-id")
def first_txn_id(db: Session = Depends(get_db)):
    r = db.query(Transaction.id).order_by(Transaction.id.asc()).first()
    return {"id": r[0] if r else None}
