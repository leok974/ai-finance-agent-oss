"""Model serving infrastructure with shadow/canary support."""

from __future__ import annotations
from typing import Dict, List, Tuple
import hashlib
import json
import random

from ...config import settings
from ...services.metrics import SUGGESTIONS_TOTAL
from .heuristics import suggest_for_txn

# Global model cache (lazy-loaded)
_MODEL_CACHE: Dict[str, any] = {}


def _load_model(path: str):
    """Load ML model from disk (joblib format).
    
    Args:
        path: Path to model file
        
    Returns:
        Loaded model object
    """
    if path in _MODEL_CACHE:
        return _MODEL_CACHE[path]
    
    try:
        import joblib
        model = joblib.load(path)
        _MODEL_CACHE[path] = model
        return model
    except Exception as e:
        raise RuntimeError(f"Failed to load model from {path}: {e}")


def _extract_features(txn: Dict) -> Dict[str, any]:
    """Extract ML features from transaction.
    
    Args:
        txn: Transaction dict with merchant, memo, amount, etc.
        
    Returns:
        Feature dict for model inference
    """
    # Example feature extraction (customize based on your model)
    merchant = str(txn.get("merchant", "")).lower().strip()
    memo = str(txn.get("memo", "")).lower().strip()
    amount = float(txn.get("amount", 0.0))
    
    # Basic features
    features = {
        "merchant_len": len(merchant),
        "memo_len": len(memo),
        "amount": amount,
        "amount_abs": abs(amount),
        "is_negative": 1 if amount < 0 else 0,
        "is_positive": 1 if amount > 0 else 0,
    }
    
    # Token-based features (customize based on your training)
    for keyword in ["amazon", "uber", "zelle", "rent", "grocery", "costco"]:
        features[f"has_{keyword}"] = 1 if keyword in merchant or keyword in memo else 0
    
    return features


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


def _predict_with_model(txn: Dict) -> Tuple[List[Dict], str, str]:
    """Run ML model inference on transaction.
    
    Args:
        txn: Transaction dict
        
    Returns:
        Tuple of (candidates, model_id, features_hash)
    """
    if not settings.SUGGEST_MODEL_PATH:
        raise ValueError("SUGGEST_MODEL_PATH not configured")
    
    model = _load_model(settings.SUGGEST_MODEL_PATH)
    features = _extract_features(txn)
    features_hash = _compute_features_hash(features)
    
    # TODO: Replace with actual model inference based on your model type
    # Example for sklearn/LightGBM:
    # feature_vector = [features[k] for k in FEATURE_NAMES]
    # probs = model.predict_proba([feature_vector])[0]
    # top_indices = np.argsort(probs)[::-1][:settings.SUGGEST_TOPK]
    
    # Placeholder: return empty candidates (replace with real inference)
    candidates = []
    model_id = f"model@{settings.SUGGEST_MODEL_PATH.split('/')[-1]}"
    
    return candidates, model_id, features_hash


def suggest_auto(txn: Dict) -> Tuple[List[Dict], str, str, str]:
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
            candidates, model_id, features_hash = _predict_with_model(txn)
            SUGGESTIONS_TOTAL.labels(mode="model", source=source).inc()
            return candidates, model_id, features_hash, source
        except Exception:
            # Fallback to heuristic on model failure
            pass
    
    # Heuristic fallback
    candidates = suggest_for_txn(txn)
    SUGGESTIONS_TOTAL.labels(mode="heuristic", source=source).inc()
    return candidates, "heuristic@v1", None, source
