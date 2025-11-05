"""Model serving infrastructure with shadow/canary support."""

from __future__ import annotations
from typing import Dict, List, Tuple, Optional
import hashlib
import json
import os
import random
import time

from ...config import settings
from ... import config
from ...metrics_ml import (
    ml_predict_requests_total,
    suggest_compare_total,
    suggest_source_total,
    lm_ml_predictions_total,
    lm_ml_fallback_total,
    lm_ml_predict_latency_seconds,
)
from ...ml.runtime import predict_row as ml_predict_row
from ...ml.feature_build import normalize_description
from .heuristics import suggest_for_txn
from .features import extract_features, FEATURE_NAMES
from .registry import ensure_model_registered

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

        # Register model in registry
        ensure_model_registered(_model_id, phase="shadow")

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


def _sticky_hash(s: str) -> int:
    """Compute sticky hash for canary rollout (0-99).

    Args:
        s: String to hash (typically user_id)

    Returns:
        Integer in range [0, 99]
    """
    h = hashlib.sha1(s.encode("utf-8")).hexdigest()
    return int(h[:8], 16) % 100


def _in_canary() -> bool:
    """Check if current request should use model based on canary percentage.

    Returns:
        True if should use model, False otherwise
    """
    val = (config.SUGGEST_USE_MODEL_CANARY or "0").strip()
    if val.endswith("%"):
        try:
            pct = float(val[:-1])
        except Exception:
            pct = 0.0
    else:
        try:
            pct = float(val)
        except Exception:
            pct = 0.0
    return random.random() < (pct / 100.0)


def _threshold_for(label: str) -> float:
    """Get confidence threshold for given label.

    Args:
        label: Category label

    Returns:
        Confidence threshold (0.0-1.0)
    """
    return float(config.SUGGEST_THRESHOLDS.get(label, 0.70))


def _mk_row(txn: Dict) -> Dict:
    """Build minimal feature row for ML prediction.

    Args:
        txn: Transaction dict

    Returns:
        Feature dict
    """
    desc = normalize_description(
        txn.get("description", "") or txn.get("merchant", "") or ""
    )
    dt = txn.get("created_at") or txn.get("date")
    hod = dt.hour if (dt and hasattr(dt, "hour")) else 12
    dow = dt.weekday() if (dt and hasattr(dt, "weekday")) else 3
    return {
        "abs_amount": abs(float(txn.get("amount", 0.0))),
        "merchant": txn.get("merchant", "") or "",
        "channel": txn.get("channel", "pos"),
        "hour_of_day": hod,
        "dow": dow,
        "is_weekend": dow >= 5,
        "is_subscription": bool(txn.get("is_subscription", False)),
        "norm_desc": desc[:256] if desc else "",
    }


def suggest_auto(
    txn: Dict, user_id: Optional[str] = None
) -> Tuple[List[Dict], str, Optional[str], str]:
    """Generate suggestions with shadow mode, canary, and per-class thresholds.

    Args:
        txn: Transaction dict with amount, merchant, description, created_at, etc.
        user_id: Optional user ID for sticky canary rollout

    Returns:
        Tuple of (candidates, model_id, features_hash, source)
        - candidates: List of {label, confidence, reasons}
        - model_id: Model identifier string
        - features_hash: Hash of features used (None for heuristic)
        - source: "rule", "model", "shadow"
    """
    # 1) PRIMARY = RULES (always compute)
    rule_cands = suggest_for_txn(txn)
    rule_label = rule_cands[0]["label"] if rule_cands else None

    # 2) SHADOW = MODEL (always predict if enabled)
    model_available = False
    model_label = None
    model_conf = 0.0
    model_result = None
    features_hash = None
    model_id = "heuristic@v1"

    if config.SUGGEST_ENABLE_SHADOW:
        # Build feature row
        model_features = _mk_row(txn)
        
        # Time the prediction
        t0 = time.time()
        model_result = ml_predict_row(model_features)
        latency = time.time() - t0
        
        # Record latency
        lm_ml_predict_latency_seconds.observe(latency)
        
        model_available = model_result.get("available", False)
        ml_predict_requests_total.labels(
            available=str(model_available)
        ).inc()

        if model_available:
            model_label = model_result.get("label")
            model_conf = model_result.get("confidence", 0.0)
            features_hash = _compute_features_hash(model_features)
            model_meta = model_result.get("model_meta", {})
            run_id = model_meta.get("run_id", "unknown")[:8]
            model_id = f"lgbm@{run_id}"

            # 3) AGREEMENT METRIC (shadow comparison)
            if rule_label and model_label:
                agree = (model_label == rule_label)
                suggest_compare_total.labels(agree=str(agree)).inc()

    # 4) CANARY DECISION with per-class thresholds
    use_model = False
    fallback_reason = None

    if not model_available:
        fallback_reason = "unavailable"
    elif not _in_canary():
        fallback_reason = "not_in_canary"
    else:
        # Check per-class threshold
        threshold = _threshold_for(model_label) if model_label else 0.70
        if model_conf < threshold:
            fallback_reason = "low_confidence"
        else:
            use_model = True

    # 5) EMIT METRICS
    if use_model:
        lm_ml_predictions_total.labels(accepted="True").inc()
        suggest_source_total.labels(source="model").inc()
    else:
        lm_ml_predictions_total.labels(accepted="False").inc()
        suggest_source_total.labels(source="rule").inc()
        if fallback_reason:
            lm_ml_fallback_total.labels(reason=fallback_reason).inc()

    # 6) RETURN MODEL OR RULE
    if use_model and model_result:
        # Build candidates from model predictions
        candidates = [
            {
                "label": model_label,
                "confidence": model_conf,
                "reasons": [
                    "ml:lightgbm",
                    f"f1={model_result.get('model_meta', {}).get('val_f1_macro', 0):.2f}",
                ],
            }
        ]

        # Add top alternatives if available
        if "probs" in model_result:
            probs_sorted = sorted(
                model_result["probs"].items(),
                key=lambda x: x[1],
                reverse=True,
            )
            for label, prob in probs_sorted[1:3]:  # Next 2 alternatives
                if prob >= 0.10:  # Minimum alternative threshold
                    candidates.append(
                        {
                            "label": label,
                            "confidence": prob,
                            "reasons": ["ml:lightgbm:alt"],
                        }
                    )

        return candidates, model_id, features_hash, "model"

    # Default: return rule-based suggestions
    return rule_cands, "heuristic@v1", None, "rule"
