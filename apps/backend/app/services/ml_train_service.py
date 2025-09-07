from __future__ import annotations
from typing import Optional, Dict, Any
from sqlalchemy.orm import Session

from app.services.ml_train import train_on_db


def retrain_model(db: Session, month: Optional[str] = None, min_samples: int = 6, test_size: float = 0.2) -> Dict[str, Any]:
    return train_on_db(db, month=month, min_samples=min_samples, test_size=test_size)
