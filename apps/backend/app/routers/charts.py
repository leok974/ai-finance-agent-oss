from fastapi import APIRouter, Depends, Query, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.db import get_db
from app.services.charts_data import (
    latest_month_str,
    get_month_summary as srv_get_month_summary,
    get_month_merchants as srv_get_month_merchants,
    get_month_flows as srv_get_month_flows,
    get_spending_trends as srv_get_spending_trends,
)
from app.services.charts_data import get_category_timeseries

router = APIRouter()


@router.get("/month_summary")
def month_summary(month: str | None = Query(None, pattern=r"^\d{4}-\d{2}$"), db: Session = Depends(get_db)):
    if not month:
        # No explicit month: prefer legacy in-memory behavior for compatibility with onboarding
        try:
            from app.main import app as _app
            txns = getattr(_app.state, "txns", None)
            if txns:
                # compute latest month from in-memory txns
                dates = [t.get("date", "") for t in txns if isinstance(t, dict) and t.get("date")]
                if not dates:
                    return {"month": None, "total_spend": 0.0, "total_income": 0.0, "net": 0.0, "categories": []}
                latest = max(dates)[:7]
                # filter to that month and compute aggregates
                month_txns = [t for t in txns if isinstance(t, dict) and str(t.get("date", "")).startswith(latest)]
                spend = 0.0
                income = 0.0
                cats: dict[str, float] = {}
                for t in month_txns:
                    amt = float(t.get("amount", 0) or 0)
                    cat = (t.get("category") or "Unknown")
                    if amt < 0:
                        a = abs(amt)
                        spend += a
                        cats[cat] = cats.get(cat, 0.0) + a
                    elif amt > 0:
                        income += amt
                categories = [{"name": k, "amount": round(v, 2)} for k, v in cats.items()]
                return {
                    "month": latest,
                    "total_spend": round(spend, 2),
                    "total_income": round(income, 2),
                    "net": round(income - spend, 2),
                    "categories": categories,
                }
            else:
                # No in-memory txns -> return empty payload (even if DB has rows) to satisfy onboarding flow
                return {"month": None, "total_spend": 0.0, "total_income": 0.0, "net": 0.0, "categories": []}
        except Exception:
            return {"month": None, "total_spend": 0.0, "total_income": 0.0, "net": 0.0, "categories": []}
    # Explicit month provided -> use DB-backed summary
    m = month
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


class CategoryPoint(BaseModel):
    month: str = Field(..., description='Month key "YYYY-MM"', example="2025-09")
    amount: float = Field(..., description="Total expense magnitude for this month")


class CategorySeriesResp(BaseModel):
    category: str = Field(..., description="Category name", example="Groceries")
    months: int = Field(..., ge=1, le=36, description="Lookback window in months", example=6)
    series: list[CategoryPoint] = Field(default_factory=list, description="Time series")

    class Config:
        json_schema_extra = {
            "examples": [{
                "category":"Groceries","months":6,
                "series":[{"month":"2025-04","amount":420.0},{"month":"2025-05","amount":390.0}]
            }]
        }


@router.get(
    "/category",
    response_model=CategorySeriesResp,
    summary="Category time series (expenses only)"
)
def chart_category(
    category: str = Query(..., min_length=1, description="Category to chart", example="Groceries"),
    months: int = Query(6, ge=1, le=36, description="Months of history to include", example=6),
    db: Session = Depends(get_db),
):
    """
    Sums **expense magnitudes** (amount < 0 → abs) per month. Income & transfers excluded.
    """
    data = get_category_timeseries(db, category=category, months=months)
    if data is None:
        raise HTTPException(status_code=404, detail="Category not found or no data")
    return {"category": category, "months": months, "series": data}