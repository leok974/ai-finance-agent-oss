# apps/backend/app/routers/charts.py
from fastapi import APIRouter, Query, HTTPException

router = APIRouter()

@router.get("/month_summary")
def month_summary(month: str = Query(..., pattern=r"^\d{4}-\d{2}$")):
    # TODO: compute real summary. For now return empty/defaults to satisfy UI.
    return {
        "month": month,
        "total_spend": 0.0,
        "total_income": 0.0,
        "categories": []  # [{ "name": "...","amount": 0 }]
    }

@router.get("/month_merchants")
def month_merchants(month: str = Query(..., pattern=r"^\d{4}-\d{2}$")):
    # TODO: aggregate spend per merchant
    return {
        "month": month,
        "merchants": []  # [{ "merchant": "...","amount": 0 }]
    }

@router.get("/month_flows")
def month_flows(month: str = Query(..., pattern=r"^\d{4}-\d{2}$")):
    # TODO: produce inflow/outflow series for the month
    return {
        "month": month,
        "series": []  # [{ "date": "YYYY-MM-DD","in": 0,"out": 0 }]
    }
