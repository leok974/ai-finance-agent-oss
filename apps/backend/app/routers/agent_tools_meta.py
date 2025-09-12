from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import Optional, Dict
from app.database import get_db
from app.transactions import Transaction
import subprocess

router = APIRouter(prefix="/agent/tools/meta", tags=["agent_tools.meta"])

@router.post("/latest_month")
def latest_month(db: Session = Depends(get_db)) -> Dict[str, Optional[str]]:
    # Prefer MAX(date) if your date column is a proper DATE; derive YYYY-MM from it.
    # Fallback to MAX(month) if some ingests only set month.
    latest_date = db.query(func.max(Transaction.date)).scalar()
    if latest_date is not None:
        month = latest_date.strftime("%Y-%m")
        return {"month": month}

    # Fallback: month column (should be zero-padded "YYYY-MM")
    latest_month = db.query(func.max(Transaction.month)).filter(Transaction.month.isnot(None)).scalar()
    return {"month": latest_month}

@router.post("/version")
def version(_: dict | None = None, db: Session = Depends(get_db)):
    try:
        branch = subprocess.check_output(["git","rev-parse","--abbrev-ref","HEAD"]).decode().strip()
    except Exception:
        branch = None
    try:
        sha = subprocess.check_output(["git","rev-parse","--short","HEAD"]).decode().strip()
    except Exception:
        sha = None
    return {"branch": branch, "commit": sha}
