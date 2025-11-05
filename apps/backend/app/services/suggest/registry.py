"""Model registry helper functions."""
from app.db import SessionLocal
from app.models.model_registry import ModelRegistry


def ensure_model_registered(model_id: str, phase: str | None = None) -> None:
    """
    Ensure a model is registered in the model_registry table.
    Creates a new entry if the model_id doesn't exist.
    
    Args:
        model_id: Unique identifier for the model
        phase: Deployment phase ('shadow', 'canary', 'live')
    """
    if not model_id:
        return
    
    db = SessionLocal()
    try:
        row = db.query(ModelRegistry).filter(ModelRegistry.model_id == model_id).one_or_none()
        if not row:
            row = ModelRegistry(model_id=model_id, phase=phase or "shadow")
            db.add(row)
            db.commit()
    finally:
        db.close()
