"""ML Feedback Event Model - Track user feedback on ML suggestions."""

from datetime import datetime
from typing import Optional, TYPE_CHECKING

from sqlalchemy import Column, DateTime, Float, Integer, String, func
from sqlalchemy.orm import Session

from app.db import Base

if TYPE_CHECKING:
    from app.models.ml_feedback_stats import MlFeedbackMerchantCategoryStats


class MlFeedbackEvent(Base):
    """
    Records each instance of user feedback on an ML suggestion.
    """

    __tablename__ = "ml_feedback_events"

    id = Column(Integer, primary_key=True, index=True)
    txn_id = Column(Integer, nullable=False, index=True)
    user_id = Column(String, nullable=True, index=True)
    category = Column(String(128), nullable=False, index=True)
    action = Column(String(16), nullable=False, index=True)  # accept/reject/undo
    score = Column(Float, nullable=True)
    model = Column(String(128), nullable=True)
    source = Column(String(64), nullable=True)

    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        index=True,
    )

    def apply_to_stats(self, db: Session) -> None:
        """
        Update aggregate merchant/category stats based on this feedback.
        """
        from app.models.ml_feedback_stats import MlFeedbackMerchantCategoryStats
        
        MlFeedbackMerchantCategoryStats.apply_event(db, self)
