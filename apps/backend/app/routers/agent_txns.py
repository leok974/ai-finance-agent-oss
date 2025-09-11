# apps/backend/app/routers/agent_txns.py
from fastapi import APIRouter, Depends, HTTPException, Body, Response
from pydantic import BaseModel, Field
from typing import Optional, Any, Dict
from sqlalchemy.orm import Session

from app.db import get_db  # your existing dependency
from app.utils.auth import get_current_user
from app.services.txns_nl_query import parse_nl_query, run_txn_query, NLQuery

router = APIRouter(prefix="/agent", tags=["agent"])

class TxnQueryIn(BaseModel):
    q: str = Field(..., description="Natural language query, e.g., 'Starbucks last month over $20'")
    limit: Optional[int] = Field(None, ge=1, le=500, description="Max items (defaults by intent)")
    start: Optional[str] = Field(None, description="Override start (YYYY-MM-DD)")
    end: Optional[str] = Field(None, description="Override end (YYYY-MM-DD)")
    page: Optional[int] = Field(1, ge=1, description="Page number for list results")
    page_size: Optional[int] = Field(50, ge=1, le=200, description="Items per page for list results")
    flow: Optional[str] = Field(None, description="expenses | income | all (filter by sign)")

# Friendly example hints when NL query is low-signal
HINTS = [
    'top 5 merchants this month',
    'how much did I spend on groceries last month',
    'Starbucks between 2025-08-01 and 2025-08-31',
    'groceries over $40 since 2025-07-01',
    'by month last 3 months',
    'average spend WTD',
]

def _is_low_signal(nlq: NLQuery) -> bool:
    return not any([
        nlq.merchants, nlq.categories, (nlq.start and nlq.end),
        nlq.min_amount is not None, nlq.max_amount is not None
    ])

@router.post("/txns_query", dependencies=[Depends(get_current_user)])
def txns_query(payload: TxnQueryIn, db: Session = Depends(get_db)) -> Dict[str, Any]:
    nlq = parse_nl_query(payload.q)
    if payload.limit:
        nlq.limit = payload.limit
    # pagination hints propagated to list intent
    if payload.page:
        setattr(nlq, "page", payload.page)
    if payload.page_size:
        setattr(nlq, "page_size", payload.page_size)
    if payload.flow in ("expenses", "income", "all"):
        setattr(nlq, "flow", payload.flow)
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

    # nicety: attach hints if the query looks ambiguous
    if _is_low_signal(nlq):
        meta = result.get("meta", {})
        meta["hints"] = HINTS
        meta["low_signal"] = True
        result["meta"] = meta

    # keep empty hint
    if result["intent"] in ("list", "top_merchants", "top_categories") and not result["result"]:
        meta = result.get("meta", {})
        meta["empty"] = True
        result["meta"] = meta

    return result


@router.post("/txns_query/csv", dependencies=[Depends(get_current_user)])
def txns_query_csv(payload: TxnQueryIn, db: Session = Depends(get_db)) -> Response:
    nlq = parse_nl_query(payload.q)
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
    # Force list for export and raise limit cap
    setattr(nlq, "intent", "list")
    setattr(nlq, "limit", min(payload.page_size or 1000, 5000))
    res = run_txn_query(db, nlq)
    rows = res.get("result", [])

    import csv, io
    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=["id","date","merchant","category","amount","description","merchant_canonical"])
    w.writeheader()
    for r in rows:
        w.writerow(r)
    data = buf.getvalue().encode("utf-8")
    headers = {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="txns_query.csv"',
    }
    return Response(content=data, headers=headers, media_type="text/csv")
