"""ML training pipeline.

Trains LightGBM classifier on transaction features + labels.
Auto-deploys to 'latest' if validation F1 exceeds threshold.
Includes isotonic calibration per class for improved probability estimates.
"""
from __future__ import annotations
import os
import json
import time
import uuid
from typing import Dict, Any, Tuple
import numpy as np
from sklearn.pipeline import Pipeline
from sklearn.metrics import f1_score, accuracy_score
from sklearn.isotonic import IsotonicRegression
from lightgbm import LGBMClassifier

from .dataset import load_dataframe, temporal_split
from .encode import build_preprocessor
from .model import serialize
from . import registry

# Auto-deploy threshold (set via env var)
THRESHOLD_F1 = float(os.getenv("ML_DEPLOY_THRESHOLD_F1", "0.72"))
# Per-class minimum F1 threshold
THRESHOLD_F1_MIN = float(os.getenv("ML_DEPLOY_THRESHOLD_F1_MIN", "0.60"))
# Enable calibration
CALIBRATION_ENABLED = os.getenv("ML_CALIBRATION_ENABLED", "1") == "1"


def _build_calibrator(y_true: np.ndarray, probs: np.ndarray, classes: list[str]) -> Dict[str, IsotonicRegression]:
    """Build per-class isotonic calibrators on validation set.
    
    Args:
        y_true: True labels (string array)
        probs: Predicted probabilities (N x C matrix)
        classes: Ordered list of class labels
        
    Returns:
        Dict mapping class label to fitted IsotonicRegression
    """
    calibrators = {}
    for i, cls in enumerate(classes):
        # Binary indicators: 1 if true label matches class, else 0
        y_binary = (y_true == cls).astype(int)
        
        # Predicted probability for this class
        p_cls = probs[:, i]
        
        # Fit isotonic regression
        iso = IsotonicRegression(out_of_bounds="clip")
        iso.fit(p_cls, y_binary)
        calibrators[cls] = iso
    
    return calibrators


def _build_pipeline(n_classes: int) -> Pipeline:
    """Build sklearn Pipeline with preprocessing + classifier.
    
    Args:
        n_classes: Number of target classes
        
    Returns:
        Pipeline ready for fit()
    """
    pre = build_preprocessor()
    clf = LGBMClassifier(
        objective="multiclass",
        num_class=n_classes,
        n_estimators=400,
        learning_rate=0.07,
        max_depth=-1,
        subsample=0.9,
        colsample_bytree=0.8,
        class_weight="balanced",
        n_jobs=-1,
        min_child_samples=20,
    )
    return Pipeline([("prep", pre), ("clf", clf)])


def run_train(limit: int | None = None) -> Dict[str, Any]:
    """Execute full training pipeline.
    
    Steps:
    1. Load data from database (features + labels)
    2. Temporal split (train on older, validate on recent)
    3. Train LightGBM classifier
    4. Evaluate on validation set
    5. Save model artifacts to registry
    6. Auto-deploy if F1 >= threshold
    
    Args:
        limit: Optional row limit for testing
        
    Returns:
        Dict with run_id, metrics, deployment status
    """
    start = time.time()
    run_id = f"run_{uuid.uuid4().hex[:8]}"
    
    # Load data
    df = load_dataframe(limit=limit)
    if df.empty:
        return {"run_id": run_id, "status": "no_data"}

    # Extract labels and classes
    y = df["label"].astype(str)
    classes = sorted(y.unique().tolist())
    
    # Temporal split for validation
    train_df, val_df = temporal_split(df, holdout_months=1)

    y_tr = train_df["label"].astype(str)
    y_va = val_df["label"].astype(str)

    X_tr = train_df.drop(columns=["label"])
    X_va = val_df.drop(columns=["label"])

    # Train
    pipe = _build_pipeline(n_classes=len(classes))
    pipe.fit(X_tr, y_tr)

    # Evaluate
    yhat = pipe.predict(X_va)
    yhat_proba = pipe.predict_proba(X_va)  # For calibration
    
    f1_macro = float(f1_score(y_va, yhat, average="macro"))
    acc = float(accuracy_score(y_va, yhat))
    
    # Per-class F1 scores for acceptance gate
    f1_per_class_arr = f1_score(y_va, yhat, average=None, labels=classes)
    f1_per_class_dict = {cls: float(f1_per_class_arr[i]) for i, cls in enumerate(classes)}
    min_f1 = float(np.min(f1_per_class_arr))
    
    # Calibration
    calibrators = None
    if CALIBRATION_ENABLED:
        calibrators = _build_calibrator(
            y_true=y_va.values if hasattr(y_va, 'values') else y_va,
            probs=yhat_proba,
            classes=classes
        )

    # Acceptance gate: macro F1 >= threshold AND all classes >= min threshold
    passed_gate = (f1_macro >= THRESHOLD_F1) and (min_f1 >= THRESHOLD_F1_MIN)

    # Save to registry
    tag = f"{run_id}_{int(time.time())}"
    files = serialize(pipe, classes, calibrators)
    meta = {
        "run_id": run_id,
        "val_f1_macro": f1_macro,
        "val_f1_min": min_f1,
        "val_f1_per_class": f1_per_class_dict,
        "val_accuracy": acc,
        "class_count": len(classes),
        "classes": classes,
        "train_size": len(train_df),
        "val_size": len(val_df),
        "created_at": int(time.time()),
        "tag": tag,
        "threshold_f1": THRESHOLD_F1,
        "threshold_f1_min": THRESHOLD_F1_MIN,
        "calibration_enabled": CALIBRATION_ENABLED,
        "passed_acceptance_gate": passed_gate,
    }
    registry.save_run(tag, meta, files)

    # Auto-deploy only if acceptance gate passed
    if passed_gate:
        registry.swap_to(tag)
        meta["deployed"] = True
    else:
        meta["deployed"] = False
        meta["deploy_reason"] = (
            f"Failed gate: f1_macro={f1_macro:.3f} (need {THRESHOLD_F1}), "
            f"min_f1={min_f1:.3f} (need {THRESHOLD_F1_MIN})"
        )

    # Optional: Write to ml_training_runs table
    try:
        from app.db import get_db
        from app.ml.models import MLTrainingRun
        from datetime import datetime
        
        db = next(get_db())
        run_record = MLTrainingRun(
            run_id=run_id,
            started_at=datetime.fromtimestamp(start),
            finished_at=datetime.now(),
            feature_count=X_tr.shape[1] if hasattr(X_tr, 'shape') else None,
            train_size=len(train_df),
            test_size=len(val_df),
            f1_macro=f1_macro,
            accuracy=acc,
            class_count=len(classes),
            model_uri=tag,
            notes=f"Auto-deployed: {meta['deployed']}, Gate: {passed_gate}, Threshold: {THRESHOLD_F1}",
        )
        db.add(run_record)
        db.commit()
    except Exception as e:
        # Don't fail training if DB write fails
        meta["db_write_error"] = str(e)

    meta["elapsed_seconds"] = time.time() - start
    return meta
