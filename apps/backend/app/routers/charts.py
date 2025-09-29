from fastapi import APIRouter, Depends, Query, HTTPException, Request
from pydantic import BaseModel, Field, ConfigDict
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
from app.utils.auth import get_current_user

router = APIRouter(prefix="/charts", tags=["charts"])


@router.get("/month_summary", dependencies=[Depends(get_current_user)])
def month_summary(
    month: str | None = Query(None, pattern=r"^\d{4}-\d{2}$"),
    db: Session = Depends(get_db),
    request: Request = None,  # type: ignore[assignment]
):
    """Month financial summary.

    Behavior matrix:
    - Explicit ?month=YYYY-MM  -> always DB-backed summary for that month (raises if not found upstream).
    - No month param & in-memory txns populated -> derive latest from in-memory (onboarding / quick preview path).
    - No month param & in-memory empty:
         * If DB has any txn months -> fallback to DB latest summary
         * Else -> return null/zero payload for onboarding UI.
    """
    if month:
        return srv_get_month_summary(db, month)

    # No explicit month: inspect in-memory first
    latest_mem: str | None = None
    month_payload = {"month": None, "total_spend": 0.0, "total_income": 0.0, "net": 0.0, "categories": []}
    try:  # in-memory path (never raises outward)
        # Prefer request.app.state if available so tests mutating app.state.txns
        # after import are reflected. Fall back to late import if request absent.
        if request is not None:
            txns = getattr(request.app.state, "txns", None)
        else:
            from app.main import app as _app  # fallback
            txns = getattr(_app.state, "txns", None)
        if txns:
            dates = [t.get("date", "") for t in txns if isinstance(t, dict) and t.get("date")]
            if dates:
                latest_mem = max(dates)[:7]
                # Aggregate only that month
                spend = 0.0
                income = 0.0
                cats: dict[str, float] = {}
                for t in txns:
                    if not isinstance(t, dict):
                        continue
                    d = str(t.get("date", ""))
                    if not d.startswith(latest_mem):
                        continue
                    amt = float(t.get("amount", 0) or 0)
                    cat = (t.get("category") or "Unknown")
                    if amt < 0:
                        a = abs(amt)
                        spend += a
                        cats[cat] = cats.get(cat, 0.0) + a
                    elif amt > 0:
                        income += amt
                categories = [{"name": k, "amount": round(v, 2)} for k, v in cats.items()]
                month_payload = {
                    "month": latest_mem,
                    "total_spend": round(spend, 2),
                    "total_income": round(income, 2),
                    "net": round(income - spend, 2),
                    "categories": categories,
                }
    except Exception:
        pass  # fall through to DB / empty fallback

    if latest_mem is not None:
        return month_payload

    # In-memory empty: try DB latest
    try:
        latest_db = latest_month_str(db)
    except Exception:
        latest_db = None
    if latest_db:
        return srv_get_month_summary(db, latest_db)
    return month_payload


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
    month: str = Field(..., description='Month key "YYYY-MM"', json_schema_extra={"examples":["2025-09"]})
    amount: float = Field(..., description="Total expense magnitude for this month")


class CategorySeriesResp(BaseModel):
    category: str = Field(..., description="Category name", json_schema_extra={"examples":["Groceries"]})
    months: int = Field(..., ge=1, le=36, description="Lookback window in months", json_schema_extra={"examples":[6]})
    series: list[CategoryPoint] = Field(default_factory=list, description="Time series")

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [{
                "category": "Groceries", "months": 6,
                "series": [
                    {"month": "2025-04", "amount": 420.0},
                    {"month": "2025-05", "amount": 390.0}
                ]
            }]
        }
    )


@router.get(
    "/category",
    response_model=CategorySeriesResp,
    summary="Category time series (expenses only)"
)
def chart_category(
    category: str = Query(..., min_length=1, description="Category to chart"),
    months: int = Query(6, ge=1, le=36, description="Months of history to include"),
    db: Session = Depends(get_db),
):
    """
    Sums **expense magnitudes** (amount < 0 → abs) per month. Income & transfers excluded.
    """
    data = get_category_timeseries(db, category=category, months=months)
    if data is None:
        raise HTTPException(status_code=404, detail="Category not found or no data")
    return {"category": category, "months": months, "series": data}