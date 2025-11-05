"""Model wrapper for inference.

Wraps sklearn Pipeline + class labels + calibrators for single-row prediction with calibrated probabilities.
"""
from __future__ import annotations
from typing import Dict, Any, Optional
import joblib
import json
import numpy as np
from sklearn.pipeline import Pipeline
from sklearn.isotonic import IsotonicRegression


class SuggestModel:
    """Wrapper for trained suggestion model with optional calibration."""
    
    def __init__(
        self, 
        pipeline: Pipeline, 
        classes_: list[str],
        calibrators: Optional[Dict[str, IsotonicRegression]] = None
    ):
        """Initialize model with sklearn pipeline, class labels, and optional calibrators.
        
        Args:
            pipeline: Trained sklearn Pipeline (preprocessor + classifier)
            classes_: Ordered list of class labels
            calibrators: Optional dict of class → IsotonicRegression calibrator
        """
        self.pipeline = pipeline
        self.classes_ = classes_
        self.calibrators = calibrators

    def predict_one(self, row: Dict[str, Any]) -> Dict[str, Any]:
        """Predict category for a single transaction with calibrated probabilities.
        
        Args:
            row: Dict with feature keys (merchant, amount, norm_desc, etc.)
            
        Returns:
            Dict with:
                - label: Predicted category
                - confidence: Calibrated probability of predicted class
                - probs: Dict of all calibrated class probabilities
        """
        import pandas as pd
        
        X = pd.DataFrame([row])
        proba = self.pipeline.predict_proba(X)[0]
        
        # Apply calibration if available
        if self.calibrators:
            calibrated = np.zeros_like(proba)
            for i, cls in enumerate(self.classes_):
                if cls in self.calibrators:
                    calibrated[i] = self.calibrators[cls].predict([proba[i]])[0]
                else:
                    calibrated[i] = proba[i]
            
            # Renormalize to sum=1
            proba = calibrated / calibrated.sum()
        
        idx = int(proba.argmax())
        
        return {
            "label": self.classes_[idx],
            "confidence": float(proba[idx]),
            "probs": {cls: float(p) for cls, p in zip(self.classes_, proba)}
        }


def serialize(
    pipeline: Pipeline, 
    classes: list[str],
    calibrators: Optional[Dict[str, IsotonicRegression]] = None
) -> Dict[str, bytes]:
    """Serialize model artifacts to bytes.
    
    Args:
        pipeline: Trained sklearn Pipeline
        classes: List of class labels
        calibrators: Optional dict of class → IsotonicRegression calibrator
        
    Returns:
        Dict of filename → binary data
    """
    files = {
        "pipeline.joblib": joblib.dumps(pipeline),
        "classes.json": json.dumps(classes).encode("utf-8"),
    }
    
    if calibrators:
        files["calibrator.pkl"] = joblib.dumps(calibrators)
    
    return files


def load_from_dir(dir_path: str) -> SuggestModel:
    """Load model from filesystem directory.
    
    Args:
        dir_path: Path to directory with pipeline.joblib, classes.json, and optional calibrator.pkl
        
    Returns:
        SuggestModel instance ready for inference
    """
    import pathlib
    import json
    import joblib
    
    p = pathlib.Path(dir_path)
    pipeline = joblib.loads((p / "pipeline.joblib").read_bytes())
    classes = json.loads((p / "classes.json").read_text())
    
    # Load calibrators if available
    calibrators = None
    calibrator_path = p / "calibrator.pkl"
    if calibrator_path.exists():
        calibrators = joblib.loads(calibrator_path.read_bytes())
    
    return SuggestModel(pipeline, classes, calibrators)
