from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from typing import Optional, List, Dict, Any

from app.db import get_db  # use existing DB dependency
from app.utils.state import get_state
from app.services.planner import build_plan, apply_actions
from app.utils.csrf import csrf_protect


router = APIRouter(prefix="/agent/plan", tags=["agent-plan"])


@router.get("/status")
def plan_status():
    last = get_state("planner.last_plan")
    return {"ok": True, "enabled": True, "status": "idle" if last else "cold", "last_plan": last}


@router.post("/preview", dependencies=[Depends(csrf_protect)])
def plan_preview(payload: Dict[str, Any], db: Session = Depends(get_db)):
    month: Optional[str] = payload.get("month")
    try:
        plan = build_plan(db, month)
        return plan
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/apply", dependencies=[Depends(csrf_protect)])
def plan_apply(payload: Dict[str, Any], request: Request, db: Session = Depends(get_db)):
    month: Optional[str] = payload.get("month")
    actions: List[Dict[str, Any]] = payload.get("actions") or []
    if not month:
        # pull from last plan if omitted
        last = get_state("planner.last_plan")
        month = last.get("month") if last else None
    if not month:
        raise HTTPException(status_code=400, detail="month is required")
    try:
        result = apply_actions(db, month, actions)
        # If export_report included, return a direct URL hint
        if any((a or {}).get("kind") == "export_report" for a in actions):
            base = str(request.base_url).rstrip("/")
            result["report_url"] = (
                f"{base}/report/excel?month={month}&include_transactions=1&split_transactions_alpha=1"
            )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
