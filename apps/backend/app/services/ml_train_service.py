from __future__ import annotations
import joblib
import numpy as np
from pathlib import Path
import os
from typing import List, Optional, Dict, Any
import pandas as pd
from sqlalchemy.orm import Session

from app.services.ml_train import train_on_db


MODELS_DIR = Path(__file__).resolve().parents[1] / "data" / "models"
LATEST = MODELS_DIR / "latest.joblib"


def _load_pipeline():
    if not LATEST.exists():
        raise FileNotFoundError(f"No model at {LATEST}")
    return joblib.load(LATEST)


def _save_pipeline(pipe) -> None:
    # Ensure target dir exists
    os.makedirs(MODELS_DIR, exist_ok=True)
    tmp = LATEST.with_suffix(".tmp.joblib")
    joblib.dump(pipe, tmp)
    tmp.replace(LATEST)


def latest_model_path() -> str:
    """Return absolute path to latest joblib (string) for easy JSON/reporting."""
    return str(LATEST)


def _featurize(pipe, texts: List[str]):
    """
    Return a 2D feature matrix by applying all steps except the final classifier.
    Works with ColumnTransformer (named 'pre') or any transform-capable first step.
    """
    # Preferred: use the first step before 'clf'
    steps = getattr(pipe, "steps", [])
    if not steps or len(steps) < 2:
        raise RuntimeError("invalid_pipeline")

    # If named_steps exists, try common names first
    named = getattr(pipe, "named_steps", {})
    if isinstance(named, dict):
        if "pre" in named and hasattr(named["pre"], "transform"):
            return named["pre"].transform(texts)
        if "tfidf" in named and hasattr(named["tfidf"], "transform"):
            return named["tfidf"].transform(texts)

    # Fallback: apply steps[:-1] sequentially if they have .transform
    X = texts
    for name, step in steps[:-1]:
        if hasattr(step, "transform"):
            X = step.transform(X)

    # Ensure we now have a matrix-like object (sparse/numpy)
    if not hasattr(X, "shape"):
        raise RuntimeError("no_feature_transformer_found")
    return X


def incremental_update(texts: List[str], labels: List[str]) -> dict:
    """
    Incremental update for a Pipeline([('pre' or 'tfidf'/..., ...), ('clf', SGDClassifier(...))]).
    - If the classifier has no classes_ yet, initialize with incoming labels (classes=...).
    - If it already has classes_, reject truly new labels with a clear reason.
    """
    pipe = _load_pipeline()
    named = getattr(pipe, "named_steps", {})
    clf = named.get("clf") if isinstance(named, dict) else None
    if clf is None or not hasattr(clf, "partial_fit"):
        return {"updated": False, "reason": "classifier_has_no_partial_fit"}

    # Build features
    try:
        X = _featurize(pipe, texts)
    except RuntimeError as e:
        if str(e) == "no_feature_transformer_found":
            return {"updated": False, "reason": "no_vectorizer_transform"}
        raise

    current_classes = getattr(clf, "classes_", None)
    if current_classes is None:
        # first incremental update: initialize classes
        init_classes = np.array(sorted(set(labels)))
        clf.partial_fit(X, labels, classes=init_classes)
    else:
        # subsequent updates: ensure no new classes appear
        known = set(current_classes.tolist() if hasattr(current_classes, "tolist") else current_classes)
        missing = sorted(set(labels) - known)
        if missing:
            return {
                "updated": False,
                "reason": "label_not_in_model",
                "missing_labels": missing,
                "known_classes": sorted(list(known)),
            }
        clf.partial_fit(X, labels)

    _save_pipeline(pipe)
    out_classes = getattr(clf, "classes_", [])
    if hasattr(out_classes, "tolist"):
        out_classes = out_classes.tolist()
    return {"updated": True, "classes": list(out_classes)}


def retrain_model(db: Session, month: Optional[str] = None, min_samples: int = 6, test_size: float = 0.2) -> Dict[str, Any]:
    return train_on_db(db, month=month, min_samples=min_samples, test_size=test_size)


# -------- Row-aware incremental update (DataFrame-based) --------
def _get_feature_schema(pipe) -> Dict[str, Any]:
    """Detect expected input schema for the preprocessor step."""
    named = getattr(pipe, "named_steps", {})
    pre = named.get("pre") if isinstance(named, dict) else None
    if pre is not None and hasattr(pre, "transform"):
        # We know from your print that 'pre' selects 'text', ['num0','num1']
        return {"mode": "columns", "columns": ["text", "num0", "num1"], "pre": pre}
    # Fallback: tfidf-only pipelines
    tfidf = named.get("tfidf") if isinstance(named, dict) else None
    if tfidf is not None and hasattr(tfidf, "transform"):
        return {"mode": "tfidf", "tfidf": tfidf}
    raise RuntimeError("invalid_pipeline")


def _featurize_rows(pipe, rows: List[Dict[str, Any]]):
    """Build 2D matrix using expected schema (ColumnTransformer or tfidf)."""
    schema = _get_feature_schema(pipe)
    if schema["mode"] == "columns":
        cols = schema["columns"]
        # Build a DataFrame with all required columns; fill defaults if missing
        df = pd.DataFrame(rows)
        for c in cols:
            if c not in df.columns:
                df[c] = 0.0 if c.startswith("num") else ""
        # Order columns
        df = df[cols]
        return schema["pre"].transform(df)
    # tfidf mode: rows should contain 'text'
    texts = [(r.get("text") or "") for r in rows]
    return schema["tfidf"].transform(texts)


def incremental_update_rows(rows: List[Dict[str, Any]], labels: List[str]) -> dict:
    """
    rows: list of {"text": str, "num0": float, "num1": float}
    labels: list of str
    """
    pipe = _load_pipeline()
    named = getattr(pipe, "named_steps", {})
    clf = named.get("clf") if isinstance(named, dict) else None
    if clf is None or not hasattr(clf, "partial_fit"):
        return {"updated": False, "reason": "classifier_has_no_partial_fit"}

    # Featurize
    try:
        X = _featurize_rows(pipe, rows)
    except RuntimeError as e:
        return {"updated": False, "reason": str(e)}

    current_classes = getattr(clf, "classes_", None)
    if current_classes is None:
        init_classes = np.array(sorted(set(labels)))
        clf.partial_fit(X, labels, classes=init_classes)
    else:
        known = set(current_classes.tolist() if hasattr(current_classes, "tolist") else current_classes)
        missing = sorted(set(labels) - known)
        if missing:
            return {"updated": False, "reason": "label_not_in_model", "missing_labels": missing, "known_classes": sorted(list(known))}
        clf.partial_fit(X, labels)

    _save_pipeline(pipe)
    out_classes = getattr(clf, "classes_", [])
    if hasattr(out_classes, "tolist"):
        out_classes = out_classes.tolist()
    return {"updated": True, "classes": list(out_classes)}
