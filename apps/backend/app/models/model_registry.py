"""Model registry SQLAlchemy model."""
from sqlalchemy import Column, Integer, String, DateTime, Text
from datetime import datetime
from app.db import Base


class ModelRegistry(Base):
    """Registry of ML models used for suggestions."""
    __tablename__ = "model_registry"
    
    id = Column(Integer, primary_key=True)
    model_id = Column(String, nullable=False, unique=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    notes = Column(Text)
    commit_sha = Column(String)
    artifact_uri = Column(String)
    phase = Column(String)  # 'shadow'|'canary10'|'live'
