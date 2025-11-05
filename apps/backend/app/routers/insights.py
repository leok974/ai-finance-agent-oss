from fastapi import APIRouter, Query, Depends, Path
from typing import Literal
from pydantic import BaseModel, Field
from sqlalchemy import select, func
from sqlalchemy.orm import Session
from app.db import get_db
from app.transactions import Transaction
from app.services.insights_anomalies import compute_anomalies
from app.services.anomaly_ignores_store import (
    list_ignores as ai_list,
    add_ignore as ai_add,
    remove_ignore as ai_remove,
)

router = APIRouter(prefix="/insights", tags=["insights"])


@router.get("")
def insights(month: str | None = Query(None), db: Session = Depends(get_db)):
    # Total net amount (income positive, spend negative)
    total = (
        db.execute(
            select(func.sum(Transaction.amount)).where(
                Transaction.month == month if month else True
            )
        ).scalar()
        or 0.0
    )

    # Top merchants by absolute net amount
    q_merch = select(
        Transaction.merchant,
        func.sum(Transaction.amount).label("sum"),
    )
    if month:
        q_merch = q_merch.where(Transaction.month == month)
    q_merch = (
        q_merch.group_by(Transaction.merchant)
        .order_by(func.abs(func.sum(Transaction.amount)).desc())
        .limit(5)
    )
    rows = db.execute(q_merch).all()

    return {
        "month": month,
        "total": float(total),
        "top_merchants": [
            {"merchant": m or "(unknown)", "sum": float(s or 0)} for (m, s) in rows
        ],
    }


class AnomalyModel(BaseModel):
    category: str = Field(..., json_schema_extra={"examples": ["Groceries"]})
    current: float = Field(
        ...,
        description="Current month spend magnitude",
        json_schema_extra={"examples": [700.0]},
    )
    median: float = Field(
        ...,
        description="Median of prior months",
        json_schema_extra={"examples": [400.0]},
    )
    pct_from_median: float = Field(
        ...,
        description="(current - median) / median",
        json_schema_extra={"examples": [0.75]},
    )
    sample_size: int = Field(
        ..., description="Historical months used", json_schema_extra={"examples": [5]}
    )
    direction: Literal["high", "low"] = Field(
        ..., json_schema_extra={"examples": ["high"]}
    )


class AnomaliesResp(BaseModel):
    month: str | None = Field(None, json_schema_extra={"examples": ["2025-09"]})
    anomalies: list[AnomalyModel] = Field(default_factory=list)


@router.get(
    "/anomalies",
    response_model=AnomaliesResp,
    summary="Flag categories with unusual current-month spend",
)
def get_anomalies(
    months: int = Query(6, ge=3, le=24, description="History window"),
    min_spend_current: float = Query(
        50.0, ge=0, description="Ignore very small categories"
    ),
    threshold_pct: float = Query(
        0.4, ge=0.05, le=5.0, description="|% from median| to flag"
    ),
    max_results: int = Query(8, ge=1, le=50, description="Return top-N by deviation"),
    month: str | None = Query(None, description="Override anchor month YYYY-MM"),
    db: Session = Depends(get_db),
):
    ignores = ai_list(db)
    return compute_anomalies(
        db,
        months=months,
        min_spend_current=min_spend_current,
        threshold_pct=threshold_pct,
        max_results=max_results,
        target_month=month,
        ignore_categories=ignores,
    )


class IgnoreListResp(BaseModel):
    ignored: list[str] = Field(
        default_factory=list,
        json_schema_extra={"examples": [["Groceries", "Transport"]]},
    )


@router.post(
    "/anomalies/ignore/{category}",
    response_model=IgnoreListResp,
    summary="Ignore a category for anomaly surfacing (persisted)",
)
def add_anomaly_ignore(
    category: str = Path(..., min_length=1), db: Session = Depends(get_db)
):
    return {"ignored": ai_add(db, category)}


@router.get(
    "/anomalies/ignore",
    response_model=IgnoreListResp,
    summary="List ignored categories for anomalies",
)
def list_anomaly_ignores(db: Session = Depends(get_db)):
    return {"ignored": ai_list(db)}


@router.delete(
    "/anomalies/ignore/{category}",
    response_model=IgnoreListResp,
    summary="Remove category from anomaly ignore list",
)
def remove_anomaly_ignore(
    category: str = Path(..., min_length=1), db: Session = Depends(get_db)
):
    return {"ignored": ai_remove(db, category)}
