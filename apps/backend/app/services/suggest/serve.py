"""Model serving infrastructure with shadow/canary support."""

from __future__ import annotations
from typing import Dict, List, Tuple, Optional
import hashlib
import json
import os
import random

from ...config import settings
from ...services.metrics import SUGGESTIONS_TOTAL
from .heuristics import suggest_for_txn
from .features import extract_features, FEATURE_NAMES

# Global model cache (lazy-loaded)
_MODEL_CACHE: Dict[str, any] = {}
_model_id = None
_feature_list = None


def _load_model():
    """Load ML model from disk (joblib format).

    Returns:
        Loaded model object (CalibratedClassifierCV wrapping LightGBM)
    """
    global _MODEL_CACHE, _feature_list, _model_id

    path = settings.SUGGEST_MODEL_PATH
    if not path or not os.path.exists(path):
        return None

    if path in _MODEL_CACHE:
        return _MODEL_CACHE[path]

    try:
        import joblib

        blob = joblib.load(path)  # {"model": CalibratedClassifierCV, "meta": {...}}
        model = blob.get("model")
        meta = blob.get("meta", {})

        _MODEL_CACHE[path] = model
        _feature_list = meta.get("features", FEATURE_NAMES)
        _model_id = f"lgbm@{hashlib.sha256(json.dumps(meta).encode()).hexdigest()[:8]}"

        return model
    except Exception as e:
        # Log error but don't crash
        print(f"[serve] Failed to load model from {path}: {e}")
        return None


def _compute_features_hash(features: Dict) -> str:
    """Compute stable hash of feature dict for tracking.

    Args:
        features: Feature dictionary

    Returns:
        SHA256 hash (hex)
    """
    # Sort keys for stable hashing
    stable = json.dumps(features, sort_keys=True)
    return hashlib.sha256(stable.encode()).hexdigest()[:16]


def _predict_with_model(txn: Dict) -> Tuple[Optional[List[Dict]], Optional[Dict]]:
    """Run ML model inference on transaction.

    Args:
        txn: Transaction dict

    Returns:
        Tuple of (candidates, features)
        Returns (None, None) if model unavailable or inference fails
    """
    model = _load_model()
    if model is None:
        return None, None

    try:
        # Extract features
        feats = extract_features(txn)
        feature_list = _feature_list or FEATURE_NAMES

        # Build feature vector in correct order
        X = [[feats.get(k, 0.0) for k in feature_list]]

        # Get probabilities from calibrated model
        proba = model.predict_proba(X)[0]
        classes = list(getattr(model, "classes_", []))

        # Sort by probability descending
        pairs = sorted(zip(classes, proba), key=lambda x: x[1], reverse=True)

        # Filter by minimum confidence and take top K
        min_conf = settings.SUGGEST_MIN_CONF
        top_k = settings.SUGGEST_TOPK

        candidates = [
            {"label": str(lbl), "confidence": float(p), "reasons": ["model:lgbm"]}
            for lbl, p in pairs
            if p >= min_conf
        ][:top_k]

        return candidates, feats
    except Exception as e:
        print(f"[serve] Model inference failed: {e}")
        return None, None


def suggest_auto(txn: Dict) -> Tuple[List[Dict], str, Optional[str], str]:
    """Generate suggestions with auto mode (heuristic or model based on config).

    Args:
        txn: Transaction dict

    Returns:
        Tuple of (candidates, model_id, features_hash, source)
        - candidates: List of {label, confidence, reasons}
        - model_id: Model identifier string
        - features_hash: Hash of features used (None for heuristic)
        - source: "live", "shadow", or "canary"
    """
    mode = settings.SUGGEST_MODE

    # Determine if we should use model or heuristic
    use_model = False
    source = "live"

    if mode == "model" and settings.SUGGEST_MODEL_PATH:
        use_model = True
    elif mode == "auto" and settings.SUGGEST_MODEL_PATH:
        # Canary rollout: percentage-based sampling
        if settings.SUGGEST_CANARY_PCT > 0:
            if random.randint(1, 100) <= settings.SUGGEST_CANARY_PCT:
                use_model = True
                source = "canary"

    # Shadow mode: compute model predictions but don't return them
    if settings.SUGGEST_SHADOW and settings.SUGGEST_MODEL_PATH and not use_model:
        try:
            _predict_with_model(txn)  # Log predictions silently
            SUGGESTIONS_TOTAL.labels(mode="model", source="shadow").inc()
        except Exception:
            pass  # Shadow failures are silent

    # Generate actual suggestions
    if use_model:
        try:
            candidates, feats = _predict_with_model(txn)
            if candidates and feats:
                features_hash = _compute_features_hash(feats)
                SUGGESTIONS_TOTAL.labels(mode="model", source=source).inc()
                return candidates, _model_id or "model@unknown", features_hash, source
        except Exception:
            # Fallback to heuristic on model failure
            pass

    # Heuristic fallback
    candidates = suggest_for_txn(txn)
    SUGGESTIONS_TOTAL.labels(mode="heuristic", source=source).inc()
    return candidates, "heuristic@v1", None, source
