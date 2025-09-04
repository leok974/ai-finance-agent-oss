from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import desc
from typing import Optional, Dict, Any
from pydantic import BaseModel
from app.database import get_db
from app.orm_models import Transaction

router = APIRouter(prefix="/agent/tools/meta", tags=["agent_tools.meta"])

@router.post("/latest_month")
def latest_month(db: Session = Depends(get_db)) -> Dict[str, Optional[str]]:
    print("🔍 Meta endpoint: latest_month called")  # Add this debug
    row = db.query(Transaction).order_by(desc(Transaction.date)).first()
    month = row.month if row and getattr(row, "month", None) else None
    print(f"📅 Meta endpoint: found month = {month}")  # Add this debug
    return {"month": month}

class MonthIn(BaseModel):
    month: str

@router.post("/month_debug")
def month_debug(body: MonthIn, db: Session = Depends(get_db)):
    q = db.query(Transaction).filter(Transaction.month == body.month)
    total = 0.0
    pos = 0.0
    neg = 0.0
    n = 0
    for t in q:
        amt = float(t.amount or 0)
        total += amt
        if amt > 0: pos += amt
        if amt < 0: neg += amt
        n += 1
    return {
        "month": body.month,
        "count": n,
        "sum_total": total,
        "sum_positive": pos,
        "sum_negative": neg,
    }
