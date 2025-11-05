"""Suggestion event and feedback models for ML-powered category suggestions."""

from __future__ import annotations
from datetime import datetime
import enum
from typing import Optional
from sqlalchemy import (
    Column,
    DateTime,
    String,
    JSON,
    ForeignKey,
    Integer,
    Index,
    Float,
    Text,
    Enum as SAEnum,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship, Mapped, mapped_column
import uuid

from ..db import Base


class SuggestionEvent(Base):
    """Records a suggestion generation event for one or more transactions."""

    __tablename__ = "suggestion_events"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    txn_id = Column(
        Integer,
        ForeignKey("transactions.id", ondelete="CASCADE"),
        nullable=False,
    )
    model_id = Column(String, nullable=True)  # e.g., heuristic@v1, lgbm@<sha>
    features_hash = Column(String, nullable=True)
    candidates = Column(JSON, nullable=False)  # list[{label, confidence, reasons}]
    mode = Column(String, nullable=False)  # heuristic|model|auto
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    feedback = relationship(
        "SuggestionFeedback", back_populates="event", cascade="all, delete-orphan"
    )


# Explicit index for performance
Index("ix_suggestion_events_txn_id", SuggestionEvent.txn_id)


# --- NEW: Enhanced SuggestionFeedback model ------------------------------------------
class SuggestionAction(str, enum.Enum):
    accept = "accept"
    reject = "reject"


class SuggestionFeedback(Base):
    """User feedback on a suggestion (accept/reject with label and confidence)."""

    __tablename__ = "suggestion_feedback"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    # Optional link to suggestion event (if front-end passes it)
    event_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("suggestion_events.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Always record the concrete txn for analytics joins
    txn_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)

    action: Mapped[SuggestionAction] = mapped_column(
        SAEnum(SuggestionAction, name="suggestion_action"), nullable=False, index=True
    )
    label: Mapped[str] = mapped_column(
        String(128), nullable=False
    )  # category chosen/seen
    confidence: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    user_id: Mapped[Optional[str]] = mapped_column(
        String(128), nullable=True
    )  # optional actor (email/id)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    event = relationship("SuggestionEvent", back_populates="feedback")

    __table_args__ = (Index("ix_suggestion_feedback_created_at", "created_at"),)
