#!/usr/bin/env python
"""Training script for LightGBM category suggestion model.

This script trains a LightGBM classifier on labeled transaction data,
calibrates the probabilities, and saves the model for production use.

Usage:
    python -m app.ml.train_lightgbm [--golden-path PATH] [--out-dir PATH]
"""

from __future__ import annotations
import argparse
import json
import hashlib
from pathlib import Path
from datetime import datetime

import pandas as pd
import lightgbm as lgb
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.calibration import CalibratedClassifierCV
from sklearn.metrics import classification_report, accuracy_score

# Import feature names from serving code to ensure alignment
import sys

sys.path.insert(0, str(Path(__file__).parent.parent))
from services.suggest.features import FEATURE_NAMES


def load_golden_data(path: Path) -> pd.DataFrame:
    """Load labeled transaction data.

    Args:
        path: Path to parquet or CSV file

    Returns:
        DataFrame with features + label column
    """
    if path.suffix == ".parquet":
        df = pd.read_parquet(path)
    elif path.suffix == ".csv":
        df = pd.read_csv(path)
    else:
        raise ValueError(f"Unsupported file format: {path.suffix}")

    print(f"[train] Loaded {len(df)} transactions from {path}")
    return df


def train_model(
    golden_path: Path,
    out_dir: Path,
    test_size: float = 0.2,
    random_state: int = 42,
) -> dict:
    """Train and save LightGBM model.

    Args:
        golden_path: Path to labeled data
        out_dir: Output directory for model artifacts
        test_size: Fraction of data for test set
        random_state: Random seed for reproducibility

    Returns:
        Training metadata dict
    """
    # Load data
    df = load_golden_data(golden_path)

    # Validate columns
    label_col = "label"
    if label_col not in df.columns:
        raise ValueError(f"Missing '{label_col}' column in training data")

    missing_features = set(FEATURE_NAMES) - set(df.columns)
    if missing_features:
        raise ValueError(f"Missing features in training data: {missing_features}")

    # Prepare X, y
    X = df[FEATURE_NAMES]
    y = df[label_col]

    print(f"[train] Features: {len(FEATURE_NAMES)}")
    print(f"[train] Classes: {y.nunique()}")
    print("[train] Distribution:")
    print(y.value_counts().head(10))

    # Split data
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=test_size, random_state=random_state, stratify=y
    )

    print(f"[train] Train: {len(X_train)}, Test: {len(X_test)}")

    # Train base classifier
    print("[train] Training LightGBM classifier...")
    clf = lgb.LGBMClassifier(
        n_estimators=300,
        learning_rate=0.05,
        num_leaves=63,
        subsample=0.9,
        colsample_bytree=0.9,
        random_state=random_state,
        verbosity=-1,
    )
    clf.fit(X_train, y_train)

    # Cross-validation score
    cv_scores = cross_val_score(clf, X_train, y_train, cv=3, scoring="accuracy")
    print(f"[train] CV accuracy: {cv_scores.mean():.4f} ± {cv_scores.std():.4f}")

    # Calibrate probabilities
    print("[train] Calibrating probabilities...")
    cal = CalibratedClassifierCV(clf, method="sigmoid", cv=3)
    cal.fit(X_train, y_train)

    # Evaluate
    y_pred = cal.predict(X_test)
    acc = accuracy_score(y_test, y_pred)
    print(f"[train] Test accuracy: {acc:.4f}")

    print("[train] Classification report:")
    print(classification_report(y_test, y_pred))

    # Feature importance (from base estimator)
    importance = dict(zip(FEATURE_NAMES, clf.feature_importances_))
    top_features = sorted(importance.items(), key=lambda x: x[1], reverse=True)[:10]
    print("[train] Top 10 features:")
    for feat, imp in top_features:
        print(f"  {feat}: {imp:.4f}")

    # Prepare metadata
    meta = {
        "features": FEATURE_NAMES,
        "n_classes": int(y.nunique()),
        "classes": list(cal.classes_),
        "metrics": {
            "accuracy": float(acc),
            "cv_mean": float(cv_scores.mean()),
            "cv_std": float(cv_scores.std()),
        },
        "training": {
            "n_train": int(len(X_train)),
            "n_test": int(len(X_test)),
            "test_size": test_size,
            "random_state": random_state,
        },
        "feature_importance": {k: float(v) for k, v in top_features},
        "trained_at": datetime.utcnow().isoformat(),
    }

    # Save model
    out_dir.mkdir(parents=True, exist_ok=True)
    model_path = out_dir / "model.joblib"

    import joblib

    joblib.dump({"model": cal, "meta": meta}, model_path)
    print(f"[train] Saved model to {model_path}")

    # Save version manifest
    version_path = out_dir / "version.json"
    version_path.write_text(json.dumps(meta, indent=2))
    print(f"[train] Saved version manifest to {version_path}")

    # Compute model hash
    model_hash = hashlib.sha256(model_path.read_bytes()).hexdigest()[:16]
    print(f"[train] Model hash: {model_hash}")

    return meta


def main():
    parser = argparse.ArgumentParser(description="Train LightGBM suggestion model")
    parser.add_argument(
        "--golden-path",
        type=Path,
        default=Path("data/golden/txns_labeled.parquet"),
        help="Path to labeled training data (parquet/csv)",
    )
    parser.add_argument(
        "--out-dir",
        type=Path,
        default=Path("data/models"),
        help="Output directory for model artifacts",
    )
    parser.add_argument(
        "--test-size", type=float, default=0.2, help="Fraction of data for test set"
    )
    parser.add_argument("--seed", type=int, default=42, help="Random seed")

    args = parser.parse_args()

    if not args.golden_path.exists():
        print(f"[ERROR] Training data not found: {args.golden_path}")
        print("[INFO] Please prepare labeled data with columns:")
        print("  - label (target category)")
        print(f"  - {', '.join(FEATURE_NAMES[:5])} ... ({len(FEATURE_NAMES)} features)")
        return 1

    try:
        meta = train_model(
            golden_path=args.golden_path,
            out_dir=args.out_dir,
            test_size=args.test_size,
            random_state=args.seed,
        )
        print("\n[SUCCESS] Training complete!")
        print(f"  Accuracy: {meta['metrics']['accuracy']:.4f}")
        print(f"  Model: {args.out_dir / 'model.joblib'}")
        return 0
    except Exception as e:
        print(f"\n[ERROR] Training failed: {e}")
        import traceback

        traceback.print_exc()
        return 1


if __name__ == "__main__":
    exit(main())
