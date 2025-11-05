"""ML Phase 2 API endpoints - Production-ready training pipeline.

Provides:
- POST /ml/v2/train - Trigger training run with LightGBM
- POST /ml/v2/predict - Predict category for features
- GET /ml/v2/model/status - Check deployed model status
"""
from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any
import time

from app.ml.train import run_train
from app.ml.runtime import predict_row, reload_model_cache
from app.metrics_ml import (
    ml_train_runs_total,
    ml_train_val_f1_macro,
    ml_predict_requests_total,
    ml_predict_latency_seconds,
)

router = APIRouter(prefix="/ml/v2", tags=["ml-v2"])


class PredictIn(BaseModel):
    """Input payload for prediction endpoint."""
    
    # Optional: Fetch features from DB by txn_id
    txn_id: Optional[int] = Field(None, description="Transaction ID to fetch features for")
    
    # Or provide raw feature payload
    amount: Optional[float] = Field(None, description="Transaction amount")
    abs_amount: Optional[float] = Field(None, description="Absolute amount")
    merchant: Optional[str] = Field(None, description="Merchant name")
    mcc: Optional[str] = Field(None, description="Merchant category code")
    channel: Optional[str] = Field(None, description="Transaction channel (pos, online, ach, etc.)")
    hour_of_day: Optional[int] = Field(None, description="Hour of day (0-23)")
    dow: Optional[int] = Field(None, description="Day of week (0=Monday)")
    is_weekend: Optional[bool] = Field(None, description="Is weekend?")
    is_subscription: Optional[bool] = Field(None, description="Is subscription?")
    norm_desc: Optional[str] = Field(None, description="Normalized description")


@router.post("/train")
def train(limit: Optional[int] = None):
    """Trigger ML training run (Phase 2 pipeline).
    
    Steps:
    1. Load features + labels from database
    2. Train LightGBM classifier
    3. Evaluate on temporal validation set
    4. Auto-deploy if F1 >= threshold (env var ML_DEPLOY_THRESHOLD_F1)
    
    Args:
        limit: Optional row limit for testing (default: all data from last 180 days)
        
    Returns:
        Dict with run_id, metrics, deployment status
    """
    ml_train_runs_total.labels(status="started").inc()
    
    try:
        meta = run_train(limit=limit)
    except Exception as e:
        ml_train_runs_total.labels(status="error").inc()
        raise HTTPException(500, f"Training failed: {str(e)}")
    
    if meta.get("status") == "no_data":
        ml_train_runs_total.labels(status="no_data").inc()
        raise HTTPException(400, "No data available for training. Run feature extraction first.")
    
    # Update metrics
    ml_train_val_f1_macro.set(meta["val_f1_macro"])
    ml_train_runs_total.labels(status="finished").inc()
    
    # Reload model cache if deployed
    if meta.get("deployed"):
        reload_model_cache()
    
    return meta


@router.post("/predict")
def predict(payload: PredictIn):
    """Predict category for transaction features.
    
    Args:
        payload: PredictIn with either txn_id OR raw feature dict
        
    Returns:
        Dict with:
            - available: bool (whether model is loaded)
            - label: Predicted category
            - confidence: Probability
            - probs: Dict of all class probabilities
            - model_meta: Model metadata
    """
    t0 = time.time()
    
    # TODO: If txn_id provided, fetch features from DB
    # For now, use raw payload
    row: Dict[str, Any] = payload.model_dump(exclude_none=True)
    
    res = predict_row(row)
    
    # Track metrics
    ml_predict_requests_total.labels(available=str(res.get("available", False))).inc()
    ml_predict_latency_seconds.observe(time.time() - t0)
    
    return res


@router.get("/model/status")
def model_status():
    """Get deployed model status (Phase 2 model).
    
    Returns:
        Dict with:
            - available: bool
            - meta: Model metadata (run_id, f1, classes, etc.)
    """
    model, meta = reload_model_cache()
    ok = model is not None
    
    return {
        "available": ok,
        "meta": meta or {},
    }
