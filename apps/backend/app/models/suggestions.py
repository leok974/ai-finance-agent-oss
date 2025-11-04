"""Suggestion event and feedback models for ML-powered category suggestions."""

from __future__ import annotations
from datetime import datetime
from sqlalchemy import Column, DateTime, String, JSON, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
import uuid

from ..db import Base


class SuggestionEvent(Base):
    """Records a suggestion generation event for one or more transactions."""

    __tablename__ = "suggestion_events"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    txn_id = Column(UUID(as_uuid=True), index=True, nullable=False)
    model_id = Column(String, nullable=True)  # e.g., heuristic@v1, lgbm@<sha>
    features_hash = Column(String, nullable=True)
    candidates = Column(JSON, nullable=False)  # list[{label, confidence, reasons}]
    mode = Column(String, nullable=False)  # heuristic|model|auto
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    feedback = relationship(
        "SuggestionFeedback", back_populates="event", cascade="all, delete-orphan"
    )


class SuggestionFeedback(Base):
    """User feedback on a suggestion (accept, reject, undo)."""

    __tablename__ = "suggestion_feedback"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    event_id = Column(
        UUID(as_uuid=True),
        ForeignKey("suggestion_events.id"),
        index=True,
        nullable=False,
    )
    action = Column(String, nullable=False)  # accept|reject|undo
    reason = Column(String, nullable=True)
    user_ts = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    event = relationship("SuggestionEvent", back_populates="feedback")
