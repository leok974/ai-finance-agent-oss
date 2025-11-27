"""ML training pipeline.

Trains LightGBM classifier on transaction features + labels.
Auto-deploys to 'latest' if validation F1 exceeds threshold.
Includes isotonic calibration per class for improved probability estimates.

P2P Training:
    The run_p2p_training() function provides a simplified entrypoint focused
    on P2P/Transfers classification using feat_p2p_flag and feat_p2p_large_outflow
    features. It uses the same LightGBM pipeline but with minimal CLI for E2E testing.
"""

from __future__ import annotations
import os
import json
import time
import uuid
import sys
import argparse
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Dict, Any, Optional
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

# Model artifact directory (can be overridden for testing)
MODEL_DIR = Path(os.getenv("ML_MODEL_DIR", "models"))


@dataclass
class TrainingResult:
    """Training run result for P2P classifier.

    Attributes:
        rows_used: Number of labeled transactions used for training
        features_dim: Dimensionality of feature vectors after preprocessing
        metrics: Dict of validation metrics (accuracy, f1_macro, etc.)
        model_path: Path to saved model artifact
    """

    rows_used: int
    features_dim: int
    metrics: Dict[str, float]
    model_path: str


def _build_calibrator(
    y_true: np.ndarray, probs: np.ndarray, classes: list[str]
) -> Dict[str, IsotonicRegression]:
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
    f1_per_class_dict = {
        cls: float(f1_per_class_arr[i])  # type: ignore[call-overload]
        for i, cls in enumerate(classes)
    }
    min_f1 = float(np.min(f1_per_class_arr))

    # Calibration
    calibrators = None
    if CALIBRATION_ENABLED:
        calibrators = _build_calibrator(
            y_true=y_va.values if hasattr(y_va, "values") else y_va,
            probs=yhat_proba,
            classes=classes,
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
            feature_count=X_tr.shape[1] if hasattr(X_tr, "shape") else None,
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


def run_p2p_training(
    max_rows: Optional[int] = None,
    dry_run: bool = False,
    connection=None,
) -> TrainingResult:
    """End-to-end training entrypoint for P2P / transfers classifier.

    Simplified training function focused on P2P detection using:
    - feat_p2p_flag (binary P2P pattern indicator)
    - feat_p2p_large_outflow (binary large outflow >= $100)

    This function:
    1. Reads features from ml_features table (joins with transaction_labels)
    2. Trains a LightGBM classifier on all categories (including Transfers / P2P)
    3. Writes model artifact to MODEL_DIR/p2p_classifier.joblib
    4. Returns TrainingResult with metrics

    Args:
        max_rows: Optional limit on training rows (for fast dev/test runs)
        dry_run: If True, skip writing model file but still compute metrics
        connection: Optional SQLAlchemy connection/engine (for testing with in-memory DB)

    Returns:
        TrainingResult with rows_used, features_dim, metrics, model_path

    Raises:
        RuntimeError: If no training data is available
    """
    # Load data from database
    df = load_dataframe(limit=max_rows, connection=connection)
    if df.empty:
        raise RuntimeError(
            "No training data available. Ensure ml_features and transaction_labels are populated."
        )

    # Extract labels and features
    y = df["label"].astype(str)
    classes = sorted(y.unique().tolist())

    # Temporal split for validation
    train_df, val_df = temporal_split(df, holdout_months=1)

    y_tr = train_df["label"].astype(str)
    y_va = val_df["label"].astype(str)

    X_tr = train_df.drop(columns=["label"])
    X_va = val_df.drop(columns=["label"])

    # Build and train pipeline
    pipe = _build_pipeline(n_classes=len(classes))
    pipe.fit(X_tr, y_tr)

    # Evaluate on validation set
    yhat = pipe.predict(X_va)

    f1_macro = float(f1_score(y_va, yhat, average="macro"))
    acc = float(accuracy_score(y_va, yhat))

    # Per-class F1 for detailed metrics
    f1_per_class_arr = f1_score(y_va, yhat, average=None, labels=classes)
    f1_per_class = {
        cls: float(f1_per_class_arr[i])  # type: ignore[call-overload]
        for i, cls in enumerate(classes)
    }

    # Compute feature dimensionality (after preprocessing)
    X_tr_transformed = pipe.named_steps["prep"].transform(X_tr)
    features_dim = (
        X_tr_transformed.shape[1] if hasattr(X_tr_transformed, "shape") else 0
    )

    # Prepare model artifact path
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    model_path = MODEL_DIR / "p2p_classifier.joblib"

    # Save model artifact unless dry_run
    if not dry_run:
        import joblib

        joblib.dump(pipe, model_path)

    # Build metrics dict
    metrics = {
        "accuracy": acc,
        "f1_macro": f1_macro,
        "f1_per_class": f1_per_class,
        "train_size": len(train_df),
        "val_size": len(val_df),
        "n_classes": len(classes),
    }

    return TrainingResult(
        rows_used=len(df),
        features_dim=features_dim,
        metrics=metrics,
        model_path=str(model_path),
    )


def main(argv: Optional[list[str]] = None) -> int:
    """CLI entrypoint for P2P training.

    Usage:
        python -m app.ml.train --max-rows 200 --dry-run
        python -m app.ml.train --max-rows 200 --out-json data/p2p_metrics.json

    Returns:
        Exit code: 0 on success, 1 on error
    """
    parser = argparse.ArgumentParser(description="Train P2P / transfers classifier")
    parser.add_argument(
        "--max-rows", type=int, default=None, help="Limit rows for fast runs"
    )
    parser.add_argument(
        "--dry-run", action="store_true", help="Skip saving the model artifact"
    )
    parser.add_argument(
        "--out-json", type=str, default=None, help="Optional JSON metrics output path"
    )

    args = parser.parse_args(argv)

    try:
        result = run_p2p_training(max_rows=args.max_rows, dry_run=args.dry_run)
    except Exception as exc:
        # Print short error and return non-zero for CI
        print(f"[train] ERROR: {exc}", file=sys.stderr)
        return 1

    # Human-friendly console output
    print(f"[train] rows_used={result.rows_used} features_dim={result.features_dim}")
    for k, v in sorted(result.metrics.items()):
        if isinstance(v, dict):
            # Per-class metrics
            print(f"[train] {k}:")
            for cls, score in sorted(v.items()):
                print(f"  {cls}: {score:.4f}")
        else:
            print(f"[train] {k}={v if isinstance(v, int) else f'{v:.4f}'}")

    print(f"[train] model_path={result.model_path}")

    # Optional JSON output for CI/scripts
    if args.out_json:
        out_path = Path(args.out_json)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(json.dumps(asdict(result), indent=2))

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
