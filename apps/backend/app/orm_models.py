from sqlalchemy import String, Integer, Float, Date, DateTime, Text, UniqueConstraint, func, Numeric, ForeignKey, Boolean
from sqlalchemy.orm import Mapped, mapped_column
from app.db import Base
from datetime import datetime

class Transaction(Base):
    __tablename__ = "transactions"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    date: Mapped[Date] = mapped_column(Date, index=True)
    merchant: Mapped[str | None] = mapped_column(String(256), index=True)
    description: Mapped[str | None] = mapped_column(Text)
    amount: Mapped[float] = mapped_column(Float)
    category: Mapped[str | None] = mapped_column(String(128), index=True)
    raw_category: Mapped[str | None] = mapped_column(String(128))
    account: Mapped[str | None] = mapped_column(String(128), index=True)
    month: Mapped[str] = mapped_column(String(7), index=True)  # YYYY-MM
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    __table_args__ = (UniqueConstraint("date", "amount", "description", name="uq_txn_dedup"),)

class RuleORM(Base):
    __tablename__ = "rules"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    # match fields (any subset is allowed)
    merchant: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    pattern: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    # legacy targeting field kept for compatibility (e.g., 'merchant'|'description')
    target: Mapped[str | None] = mapped_column(String(32), nullable=True)
    # action
    category: Mapped[str] = mapped_column(String(128), index=True)
    # meta
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="1")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

# Backward-compat: expose classic name 'Rule' for imports/tests
Rule = RuleORM

class UserLabel(Base):
    __tablename__ = "user_labels"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    txn_id: Mapped[int] = mapped_column(Integer, index=True)
    category: Mapped[str] = mapped_column(String(128), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

# --- NEW: TransferLink --------------------------------------------------------
class TransferLink(Base):
    __tablename__ = "transfer_links"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    txn_out_id: Mapped[int] = mapped_column(Integer, ForeignKey("transactions.id"), nullable=False)
    txn_in_id: Mapped[int] = mapped_column(Integer, ForeignKey("transactions.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint("txn_out_id", "txn_in_id", name="uq_transfer_pair"),
    )

# --- NEW: TransactionSplit ----------------------------------------------------
class TransactionSplit(Base):
    __tablename__ = "transaction_splits"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    parent_txn_id: Mapped[int] = mapped_column(Integer, ForeignKey("transactions.id"), nullable=False, index=True)
    category: Mapped[str] = mapped_column(String, nullable=False)
    amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    note: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

# --- NEW: RecurringSeries -----------------------------------------------------
class RecurringSeries(Base):
    __tablename__ = "recurring_series"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    merchant: Mapped[str] = mapped_column(String, nullable=False, index=True)
    avg_amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    cadence: Mapped[str] = mapped_column(String, nullable=False)  # 'monthly'|'weekly'|'yearly'|'unknown'
    first_seen: Mapped[datetime] = mapped_column(Date, nullable=False)
    last_seen: Mapped[datetime] = mapped_column(Date, nullable=False)
    next_due: Mapped[datetime | None] = mapped_column(Date, nullable=True)
    sample_txn_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("transactions.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
