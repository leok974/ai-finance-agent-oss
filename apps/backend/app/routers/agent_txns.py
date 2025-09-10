# apps/backend/app/routers/agent_txns.py
from fastapi import APIRouter, Depends, HTTPException, Body, Response
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
    page: Optional[int] = Field(1, ge=1, description="Page number for list pagination")
    page_size: Optional[int] = Field(50, ge=1, le=200, description="Page size for list pagination")

@router.post("/txns_query")
def txns_query(payload: TxnQueryIn, db: Session = Depends(get_db)) -> Dict[str, Any]:
    nlq = parse_nl_query(payload.q)
    if payload.limit:
        nlq.limit = payload.limit
    # pagination hints propagated to list intent
    if payload.page:
        setattr(nlq, "page", payload.page)
    if payload.page_size:
        setattr(nlq, "page_size", payload.page_size)
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


@router.post("/txns_query/csv")
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
