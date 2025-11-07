from __future__ import annotations
from fastapi import APIRouter, Depends, Body
from sqlalchemy.orm import Session
from app.db import get_db
from app.services import analytics as svc
from app.deps.auth_guard import get_current_user_id

router = APIRouter(prefix="/agent/tools/analytics", tags=["analytics"])


@router.post("/kpis")
def kpis(
    payload: dict = Body(default={}),
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    month = payload.get("month") if isinstance(payload, dict) else None
    lookback_months = (
        int(payload.get("lookback_months", 6)) if isinstance(payload, dict) else 6
    )
    return svc.compute_kpis(db, month=month, lookback=lookback_months)


@router.post("/forecast/cashflow")
def forecast_cashflow(
    payload: dict = Body(default={}),
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    month = payload.get("month") if isinstance(payload, dict) else None
    horizon = int(payload.get("horizon", 3)) if isinstance(payload, dict) else 3
    model = payload.get("model", "auto") if isinstance(payload, dict) else "auto"
    alpha = payload.get("alpha") if isinstance(payload, dict) else None
    return svc.forecast_cashflow(
        db, month=month, horizon=horizon, model=model, alpha=alpha
    )


@router.post("/anomalies")
def anomalies(
    payload: dict = Body(default={}),
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    month = payload.get("month") if isinstance(payload, dict) else None
    lookback_months = (
        int(payload.get("lookback_months", 6)) if isinstance(payload, dict) else 6
    )
    return svc.find_anomalies(db, month=month, lookback=lookback_months)


@router.post("/recurring")
def recurring(
    payload: dict = Body(default={}),
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    month = payload.get("month") if isinstance(payload, dict) else None
    lookback_months = (
        int(payload.get("lookback_months", 6)) if isinstance(payload, dict) else 6
    )
    return svc.detect_recurring(db, month=month, lookback=lookback_months)


@router.post("/subscriptions")
def subscriptions(
    payload: dict = Body(default={}),
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    month = payload.get("month") if isinstance(payload, dict) else None
    lookback_months = (
        int(payload.get("lookback_months", 6)) if isinstance(payload, dict) else 6
    )
    return svc.find_subscriptions(db, month=month, lookback=lookback_months)


@router.post("/budget/suggest")
def budget_suggest(
    payload: dict = Body(default={}),
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    month = payload.get("month") if isinstance(payload, dict) else None
    lookback_months = (
        int(payload.get("lookback_months", 6)) if isinstance(payload, dict) else 6
    )
    return svc.budget_suggest(db, month=month, lookback=lookback_months)


@router.post("/whatif")
def whatif(
    payload: dict,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    return svc.whatif_sim(db, payload)
