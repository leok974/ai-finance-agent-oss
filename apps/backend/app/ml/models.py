"""ORM models for ML training infrastructure.

These models store labeled training data, extracted features, and training run metadata
for the category suggestion ML pipeline.
"""

from __future__ import annotations
from datetime import datetime, date
from typing import Optional
from sqlalchemy import (
    Integer,
    Text,
    TIMESTAMP,
    Numeric,
    Date,
    SmallInteger,
    Boolean,
    JSON,
    ForeignKey,
    DOUBLE_PRECISION,
)
from sqlalchemy.orm import Mapped, mapped_column
from app.db import Base


class TransactionLabel(Base):
    """Golden labels for transactions (human-approved categories).

    One label per transaction. Used as ground truth for ML training.
    """

    __tablename__ = "transaction_labels"

    txn_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("transactions.id", ondelete="CASCADE"),
        primary_key=True,
    )
    label: Mapped[str] = mapped_column(Text, nullable=False)
    source: Mapped[str] = mapped_column(
        Text, nullable=False
    )  # 'human', 'rule', 'import'
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP, nullable=False, server_default="NOW()"
    )
    updated_at: Mapped[datetime] = mapped_column(
        TIMESTAMP, nullable=False, server_default="NOW()"
    )

    # Relationship to transaction - TEMPORARILY DISABLED (Transaction.label commented out)
    # transaction = relationship("Transaction", back_populates="label")


class MLFeature(Base):
    """Extracted features for ML training (point-in-time feature vectors).

    Features are computed from raw transaction data and stored for reproducible
    training runs without data leakage.
    """

    __tablename__ = "ml_features"

    txn_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("transactions.id", ondelete="CASCADE"),
        primary_key=True,
    )
    ts_month: Mapped[date] = mapped_column(Date, nullable=False)  # yyyy-mm-01 bucketing
    amount: Mapped[float] = mapped_column(Numeric, nullable=False)
    abs_amount: Mapped[float] = mapped_column(Numeric, nullable=False)
    merchant: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    mcc: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    channel: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True
    )  # pos/online/ach/zelle/deposit
    hour_of_day: Mapped[Optional[int]] = mapped_column(SmallInteger, nullable=True)
    dow: Mapped[Optional[int]] = mapped_column(SmallInteger, nullable=True)  # 0=Monday
    is_weekend: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    is_subscription: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    norm_desc: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True
    )  # normalized description
    tokens: Mapped[Optional[list[str]]] = mapped_column(JSON, nullable=True)

    # P2P/Transfer detection features
    feat_p2p_flag: Mapped[Optional[bool]] = mapped_column(
        Boolean, nullable=True
    )  # Binary: 1 if P2P pattern detected
    feat_p2p_large_outflow: Mapped[Optional[bool]] = mapped_column(
        Boolean, nullable=True
    )  # Binary: 1 if P2P + large outflow (>=$100)

    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP, nullable=False, server_default="NOW()"
    )

    # Relationship to transaction - TEMPORARILY DISABLED (Transaction.features commented out)
    # transaction = relationship("Transaction", back_populates="features")


class MLTrainingRun(Base):
    """Audit log for ML training runs.

    Records metadata about each training run including dataset stats and model performance.
    """

    __tablename__ = "ml_training_runs"

    run_id: Mapped[str] = mapped_column(Text, primary_key=True)
    started_at: Mapped[datetime] = mapped_column(
        TIMESTAMP, nullable=False, server_default="NOW()"
    )
    finished_at: Mapped[Optional[datetime]] = mapped_column(TIMESTAMP, nullable=True)
    label_count: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    feature_count: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    val_f1_macro: Mapped[Optional[float]] = mapped_column(
        DOUBLE_PRECISION, nullable=True
    )
    val_accuracy: Mapped[Optional[float]] = mapped_column(
        DOUBLE_PRECISION, nullable=True
    )
    class_count: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    model_uri: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
