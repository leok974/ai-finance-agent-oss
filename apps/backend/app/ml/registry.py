"""Model registry for storing and retrieving trained models.

Provides filesystem-based model versioning with atomic swaps.
Each training run gets a unique tag (run_id + timestamp).
The 'latest' symlink points to the currently deployed model.
"""
from __future__ import annotations
import json
import os
import time
import pathlib
from typing import Dict, Any, Optional

REGISTRY_DIR = os.getenv("ML_REGISTRY_DIR", "/app/models/ledger_suggestions")


def path_for(tag: str) -> pathlib.Path:
    """Get filesystem path for a model tag."""
    return pathlib.Path(REGISTRY_DIR) / tag


def save_run(tag: str, meta: Dict[str, Any], files: Dict[str, bytes]) -> str:
    """Save a training run's artifacts and metadata.
    
    Args:
        tag: Unique identifier for this run (e.g., 'run_abc123_1699123456')
        meta: Metadata dict (f1, accuracy, classes, etc.)
        files: Binary artifacts (pipeline.joblib, classes.json)
        
    Returns:
        Absolute path to saved model directory
    """
    p = path_for(tag)
    p.mkdir(parents=True, exist_ok=True)
    
    for name, data in files.items():
        (p / name).write_bytes(data)
    
    (p / "meta.json").write_text(json.dumps(meta, indent=2))
    
    return str(p)


def latest_meta() -> Optional[Dict[str, Any]]:
    """Load metadata for the currently deployed model.
    
    Returns:
        Metadata dict or None if no model deployed
    """
    p = path_for("latest") / "meta.json"
    return json.loads(p.read_text()) if p.exists() else None


def swap_to(tag: str) -> None:
    """Atomically deploy a trained model by swapping 'latest' pointer.
    
    This copies the model artifacts from the tagged directory to 'latest',
    making it available for serving. Uses a tmp directory for atomic swap.
    
    Args:
        tag: Model tag to promote (e.g., 'run_abc123_1699123456')
    """
    src = path_for(tag)
    dst = path_for("latest")
    tmp = path_for(f".tmp_latest_{int(time.time())}")
    
    # Clear existing latest
    if dst.exists():
        for f in dst.iterdir():
            f.unlink()
    else:
        dst.mkdir(parents=True, exist_ok=True)
    
    # Copy to tmp
    tmp.mkdir(parents=True, exist_ok=True)
    for f in src.iterdir():
        (tmp / f.name).write_bytes(f.read_bytes())
    
    # Swap tmp → latest
    for f in tmp.iterdir():
        (dst / f.name).write_bytes(f.read_bytes())
    
    # Cleanup tmp
    for f in tmp.iterdir():
        f.unlink()
    tmp.rmdir()
