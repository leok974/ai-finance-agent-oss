"""ML Feedback Stats - Aggregate merchant/category feedback statistics."""

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Column, DateTime, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Session

from app.db import Base

if TYPE_CHECKING:
    from app.models.ml_feedback import MlFeedbackEvent


class MlFeedbackMerchantCategoryStats(Base):
    """
    Aggregate stats per merchant+category pair based on user feedback.
    Used to boost/demote suggestions based on historical user choices.
    """

    __tablename__ = "ml_feedback_merchant_category_stats"

    id = Column(Integer, primary_key=True)
    merchant_normalized = Column(String(255), nullable=False)
    category = Column(String(128), nullable=False)

    accept_count = Column(Integer, nullable=False, default=0)
    reject_count = Column(Integer, nullable=False, default=0)

    last_feedback_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    __table_args__ = (
        UniqueConstraint(
            "merchant_normalized",
            "category",
            name="uq_ml_feedback_merchant_category",
        ),
    )

    @classmethod
    def apply_event(cls, db: Session, event: "MlFeedbackEvent") -> None:
        """
        Increment accept/reject counters for the merchant/category of this transaction.
        If we can't resolve merchant_canonical, we no-op.

        IMPORTANT: Only applies to real user transactions (is_demo=False).
        Demo/sample data is excluded from ML training feedback.
        """
        from app.orm_models import Transaction

        txn = db.query(Transaction).filter(Transaction.id == event.txn_id).one_or_none()
        if not txn:
            return

        # DEMO ISOLATION: Skip feedback from demo transactions
        if getattr(txn, "is_demo", False):
            return

        # Use merchant_canonical from Transaction model
        merchant = getattr(txn, "merchant_canonical", None)
        if not merchant:
            return

        row = (
            db.query(cls)
            .filter(
                cls.merchant_normalized == merchant,
                cls.category == event.category,
            )
            .one_or_none()
        )

        if row is None:
            row = cls(
                merchant_normalized=merchant,
                category=event.category,
                accept_count=0,
                reject_count=0,
            )
            db.add(row)

        if event.action == "accept":
            row.accept_count = (row.accept_count or 0) + 1
        elif event.action == "reject":
            row.reject_count = (row.reject_count or 0) + 1
        elif event.action == "undo":
            # Optional: decrement if >0
            if row.accept_count and row.accept_count > 0:
                row.accept_count -= 1

        row.last_feedback_at = datetime.utcnow()
