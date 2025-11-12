"""ML status endpoint for operational visibility."""

from fastapi import APIRouter
from ..config import settings

router = APIRouter(prefix="/ml", tags=["ml-status"])


@router.get("/status")
def get_ml_status():
    """Get current ML pipeline configuration status.

    Returns:
        Configuration status including shadow mode, canary percentage, and calibration.
    """
    return {
        "shadow": bool(getattr(settings, "SUGGEST_ENABLE_SHADOW", False)),
        "canary": str(getattr(settings, "SUGGEST_USE_MODEL_CANARY", "0")),
        "calibration": bool(getattr(settings, "ML_CALIBRATION_ENABLED", False)),
        "merchant_majority_enabled": True,  # Always on in Phase 2.1
        "confidence_threshold": 0.50,  # BEST_MIN
    }
