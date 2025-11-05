"""Runtime model serving.

Loads the 'latest' deployed model from registry and caches it in memory.
Provides predict_row() for single-transaction inference.
"""
from __future__ import annotations
import os
from functools import lru_cache
from typing import Optional, Tuple, Dict, Any

from .model import load_from_dir, SuggestModel
from . import registry


@lru_cache(maxsize=1)
def _load_latest() -> Tuple[Optional[SuggestModel], Optional[Dict[str, Any]]]:
    """Load the latest deployed model from registry (cached).
    
    Returns:
        Tuple of (model, metadata) or (None, None) if no model deployed
    """
    meta = registry.latest_meta()
    if not meta:
        return None, None
    
    model_dir = os.path.join(
        os.getenv("ML_REGISTRY_DIR", "/app/models/ledger_suggestions"),
        "latest"
    )
    model = load_from_dir(model_dir)
    
    return model, meta


def predict_row(row: dict) -> Dict[str, Any]:
    """Predict category for a single transaction.
    
    Args:
        row: Dict with feature keys (merchant, amount, norm_desc, etc.)
            Can also include txn_id for DB lookup (not yet implemented)
            
    Returns:
        Dict with:
            - available: bool (whether model is loaded)
            - label: Predicted category (if available)
            - confidence: Probability (if available)
            - probs: All class probabilities (if available)
            - model_meta: Model metadata (run_id, f1)
            - reason: Error message if unavailable
    """
    model, meta = _load_latest()
    
    if not model:
        return {"available": False, "reason": "no_model"}
    
    out = model.predict_one(row)
    out["available"] = True
    out["model_meta"] = {
        "run_id": meta.get("run_id"),
        "val_f1_macro": meta.get("val_f1_macro"),
        "class_count": meta.get("class_count"),
    }
    
    return out


def reload_model_cache() -> Tuple[Optional[SuggestModel], Optional[Dict[str, Any]]]:
    """Clear and reload model cache.
    
    Call this after deploying a new model to force reload.
    
    Returns:
        Tuple of (model, metadata) after reload
    """
    _load_latest.cache_clear()
    return _load_latest()
