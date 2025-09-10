# apps/backend/app/routers/agent_txns.py
from fastapi import APIRouter, Depends, HTTPException, Body
from pydantic import BaseModel, Field
from typing import Optional, Any, Dict
from sqlalchemy.orm import Session

from app.db import get_db  # your existing dependency
from app.services.txns_nl_query import parse_nl_query, run_txn_query

router = APIRouter(prefix="/agent", tags=["agent"])

class TxnQueryIn(BaseModel):
    q: str = Field(..., description="Natural language query, e.g., 'Starbucks last month over $20'")
    limit: Optional[int] = Field(None, ge=1, le=500, description="Max items (defaults by intent)")
    start: Optional[str] = Field(None, description="Override start (YYYY-MM-DD)")
    end: Optional[str] = Field(None, description="Override end (YYYY-MM-DD)")

@router.post("/txns_query")
def txns_query(payload: TxnQueryIn, db: Session = Depends(get_db)) -> Dict[str, Any]:
    nlq = parse_nl_query(payload.q)
    if payload.limit:
        nlq.limit = payload.limit
    # explicit overrides
    from datetime import datetime
    if payload.start:
        try:
            nlq.start = datetime.strptime(payload.start, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid start date format (YYYY-MM-DD)")
    if payload.end:
        try:
            nlq.end = datetime.strptime(payload.end, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid end date format (YYYY-MM-DD)")

    result = run_txn_query(db, nlq)
    # empty guard
    if result["intent"] in ("list", "top_merchants", "top_categories") and not result["result"]:
        # 200 OK but with a hint so UI can show "no matches"
        result["meta"] = {"empty": True}
    return result
