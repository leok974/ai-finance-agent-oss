from sqlalchemy import String, Integer, Float, Date, DateTime, Text, UniqueConstraint, func, Numeric, ForeignKey, Boolean, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship, synonym, validates
from app.db import Base
from datetime import datetime, date
from app.utils.text import canonicalize_merchant

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
    # NEW: SQL-side canonical merchant (indexed)
    merchant_canonical: Mapped[str | None] = mapped_column(String(256), index=True, nullable=True)

    __table_args__ = (
        UniqueConstraint("date", "amount", "description", name="uq_txn_dedup"),
    )
    # Relationship: one-to-many feedbacks
    feedbacks: Mapped[list["Feedback"]] = relationship(
        "Feedback",
        back_populates="txn",
        cascade="all, delete-orphan",
    )

    @validates("merchant")
    def _on_merchant_set(self, key, value):
        # Keep canonical in sync with merchant
        try:
            self.merchant_canonical = canonicalize_merchant(value)
        except Exception:
            self.merchant_canonical = None
        return value

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

# --- NEW: Feedback -----------------------------------------------------------
class Feedback(Base):
    __tablename__ = "feedback"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    txn_id: Mapped[int] = mapped_column(Integer, ForeignKey("transactions.id"), index=True, nullable=False)
    label: Mapped[str] = mapped_column(String(128), nullable=False)
    source: Mapped[str] = mapped_column(String(64), nullable=False, server_default="user_change")  # user_change | accept_suggestion | rule_apply
    # Enforce NOT NULL with server default at DB level for reliable windowing
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Relationship back to transaction
    txn: Mapped["Transaction"] = relationship("Transaction", back_populates="feedbacks")
    # Alias for historical references: some service code may refer to fb.action
    # Keep the primary column name 'source'; 'action' is a read/write synonym.
    action = synonym("source")

# --- NEW: RuleSuggestion -----------------------------------------------------
class RuleSuggestion(Base):
    __tablename__ = "rule_suggestions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    merchant_norm: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    category: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    support_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    positive_rate: Mapped[float] = mapped_column(Float, nullable=False, server_default="0")
    last_seen: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    cooldown_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ignored: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="0")
    applied_rule_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("rules.id"), nullable=True)

    __table_args__ = (
        Index("ix_rule_suggestions_unique_pair", "merchant_norm", "category", unique=True),
    )
