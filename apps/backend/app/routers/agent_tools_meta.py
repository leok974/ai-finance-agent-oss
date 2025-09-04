from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import desc
from typing import Optional, Dict, Any
from app.database import get_db
from app.orm_models import Transaction

router = APIRouter(prefix="/agent/tools/meta", tags=["agent_tools.meta"])

@router.post("/latest_month")
def latest_month(db: Session = Depends(get_db)) -> Dict[str, Optional[str]]:
    row = db.query(Transaction).order_by(desc(Transaction.date)).first()
    month = row.month if row and getattr(row, "month", None) else None
    return {"month": month}
