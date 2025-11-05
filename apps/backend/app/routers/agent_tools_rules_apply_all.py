from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional, Dict, Any
from sqlalchemy.orm import Session

from app.db import get_db
from app.services.rules_apply import latest_month_from_data, apply_all_active_rules

router = APIRouter(prefix="/agent/tools/rules", tags=["agent_tools.rules"])


class ApplyAllIn(BaseModel):
    month: Optional[str] = None


@router.post("/apply_all")
def apply_all(body: ApplyAllIn, db: Session = Depends(get_db)) -> Dict[str, Any]:
    month = body.month or latest_month_from_data(db)
    if not month:
        # No data at all; keep it explicit
        raise HTTPException(
            status_code=400, detail="No data available to resolve month"
        )

    applied, skipped, details = apply_all_active_rules(db, month)
    return {
        "month": month,
        "applied": applied,
        "skipped": skipped,
        "details": details,  # small per-txn summary; safe to hide later if too noisy
    }
