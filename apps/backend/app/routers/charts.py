from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.db import get_db
from app.services.charts_data import (
    latest_month_str,
    get_month_summary as srv_get_month_summary,
    get_month_merchants as srv_get_month_merchants,
    get_month_flows as srv_get_month_flows,
    get_spending_trends as srv_get_spending_trends,
)

router = APIRouter()


@router.get("/month_summary")
def month_summary(month: str | None = Query(None, pattern=r"^\d{4}-\d{2}$"), db: Session = Depends(get_db)):
    m = month or latest_month_str(db)
    if not m:
        return {"month": None, "total_spend": 0.0, "total_income": 0.0, "net": 0.0, "categories": []}
    return srv_get_month_summary(db, m)


@router.get("/month_merchants")
def month_merchants(
    month: str | None = Query(None, pattern=r"^\d{4}-\d{2}$"),
    limit: int = Query(10, ge=1, le=500),
    db: Session = Depends(get_db),
):
    m = month or latest_month_str(db)
    if not m:
        return {"month": None, "merchants": []}
    return srv_get_month_merchants(db, m, limit=limit)


@router.get("/month_flows")
def month_flows(month: str | None = Query(None, pattern=r"^\d{4}-\d{2}$"), db: Session = Depends(get_db)):
    m = month or latest_month_str(db)
    if not m:
        return {"month": None, "series": []}
    return srv_get_month_flows(db, m)


@router.get("/spending_trends")
def spending_trends(months: int = Query(6, ge=1, le=24), db: Session = Depends(get_db)):
    return srv_get_spending_trends(db, months)