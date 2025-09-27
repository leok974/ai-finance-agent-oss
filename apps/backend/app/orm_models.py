from sqlalchemy import String, Integer, Float, Date, DateTime, Text, UniqueConstraint, func, Numeric, ForeignKey, Boolean, Index, JSON, LargeBinary
from sqlalchemy.orm import Mapped, mapped_column, relationship, synonym, validates
from sqlalchemy.ext.hybrid import hybrid_property
from app.core.crypto_state import get_dek_for_label, get_write_label
# Guard cryptography import so hermetic tests (no compiled wheels) still load ORM.
try:  # allow hermetic tests without cryptography
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM  # type: ignore
except Exception:  # pragma: no cover
    class AESGCM:  # minimal encrypt/decrypt passthrough (NOT secure – test only)
        def __init__(self, key: bytes):
            self._k = key
        def encrypt(self, nonce: bytes, data: bytes, aad):  # noqa: D401
            return data  # no-op
        def decrypt(self, nonce: bytes, data: bytes, aad):
            return data  # no-op
import os
from app.db import Base
from datetime import datetime, date
from app.utils.text import canonicalize_merchant
AAD = b"txn:v1"

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
    # NEW: Soft-delete and edit/relationship metadata
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    note: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    split_parent_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    transfer_group: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    # Encrypted fields (envelope)
    merchant_raw_enc: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
    merchant_raw_nonce: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
    description_enc: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
    description_nonce: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
    note_enc: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
    note_nonce: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
    enc_label: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)

    # ---- Encrypted views (no schema change) ----
    @hybrid_property
    def description_text(self) -> str | None:
        if not self.description_enc or not self.description_nonce:
            return None
        label = self.enc_label or "active"
        dek = get_dek_for_label(label)
        pt = AESGCM(dek).decrypt(self.description_nonce, self.description_enc, AAD)
        return pt.decode("utf-8")

    @description_text.setter
    def description_text(self, value: str | None):
        if value is None:
            self.description_enc = None
            self.description_nonce = None
            self.enc_label = None
            return
        label = get_write_label()
        dek = get_dek_for_label(label)
        nonce = os.urandom(12)
        ct = AESGCM(dek).encrypt(nonce, value.encode("utf-8"), AAD)
        self.description_enc = ct
        self.description_nonce = nonce
        self.enc_label = label

    @hybrid_property
    def merchant_raw_text(self) -> str | None:
        if not self.merchant_raw_enc or not self.merchant_raw_nonce:
            return None
        label = self.enc_label or "active"
        dek = get_dek_for_label(label)
        pt = AESGCM(dek).decrypt(self.merchant_raw_nonce, self.merchant_raw_enc, AAD)
        return pt.decode("utf-8")

    @merchant_raw_text.setter
    def merchant_raw_text(self, value: str | None):
        if value is None:
            self.merchant_raw_enc = None
            self.merchant_raw_nonce = None
            # don't clear enc_label here; description/note may still be set
            return
        label = get_write_label()
        dek = get_dek_for_label(label)
        nonce = os.urandom(12)
        ct = AESGCM(dek).encrypt(nonce, value.encode("utf-8"), AAD)
        self.merchant_raw_enc = ct
        self.merchant_raw_nonce = nonce
        self.enc_label = label

    @hybrid_property
    def note_text(self) -> str | None:
        if not self.note_enc or not self.note_nonce:
            return None
        label = self.enc_label or "active"
        dek = get_dek_for_label(label)
        pt = AESGCM(dek).decrypt(self.note_nonce, self.note_enc, AAD)
        return pt.decode("utf-8")

    @note_text.setter
    def note_text(self, value: str | None):
        if value is None:
            self.note_enc = None
            self.note_nonce = None
            # don't clear enc_label here; description/merchant may still be set
            return
        label = get_write_label()
        dek = get_dek_for_label(label)
        nonce = os.urandom(12)
        ct = AESGCM(dek).encrypt(nonce, value.encode("utf-8"), AAD)
        self.note_enc = ct
        self.note_nonce = nonce
        self.enc_label = label

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

    @validates("date")
    def _on_date_set(self, key, value):
        # Derive YYYY-MM month string for windowing and constraints
        try:
            if value is not None:
                self.month = f"{value.year:04d}-{value.month:02d}"
        except Exception:
            # Leave month untouched if date invalid
            pass
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

# --- NEW: EncryptionKey (wrapped DEKs) -----------------------------------
class EncryptionKey(Base):
    __tablename__ = "encryption_keys"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    label: Mapped[str] = mapped_column(String(32), unique=True, index=True, nullable=False)
    dek_wrapped: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    # Nullable when DEK is wrapped by KMS (nonce not used)
    dek_wrap_nonce: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

# --- NEW: EncryptionSettings (broadcast current write label) -------------
class EncryptionSettings(Base):
    __tablename__ = "encryption_settings"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    write_label: Mapped[str | None] = mapped_column(String(32), nullable=True)
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

# --- NEW: Budget -------------------------------------------------------------
class Budget(Base):
    __tablename__ = "budgets"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    category: Mapped[str] = mapped_column(String, nullable=False, index=True, unique=True)
    amount: Mapped[float] = mapped_column(Float, nullable=False)
    # Simple global budget per category (v1). If we want month-scoped later,
    # add: month = mapped_column(String, index=True) and UniqueConstraint("category", "month")
    effective_from: Mapped[date] = mapped_column(Date, nullable=False, server_default=func.current_date())
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

# --- NEW: DB-backed persisted suggestions (separate table) -----------------
class RuleSuggestionPersisted(Base):
    __tablename__ = "rule_suggestions_persisted"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    merchant: Mapped[str] = mapped_column(String(255), nullable=False)
    category: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, server_default="new", index=True)  # new|accepted|dismissed
    count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    window_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # NEW: track origin/metrics and latest mining time
    source: Mapped[str] = mapped_column(String(16), nullable=False, server_default="persisted")  # persisted|mined
    metrics_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    last_mined_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    __table_args__ = (
        UniqueConstraint("merchant", "category", name="ux_rule_suggestions_persisted_merchant_category"),
    )

# --- NEW: AnomalyIgnore (DB-backed ignores) -------------------------------
class AnomalyIgnore(Base):
    __tablename__ = "anomaly_ignores"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    category: Mapped[str] = mapped_column(String(255), nullable=False, index=True, unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


# --- NEW: RuleSuggestionIgnore (merchant/category pairs) -------------------
class RuleSuggestionIgnore(Base):
    __tablename__ = "rule_suggestion_ignores"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    merchant: Mapped[str] = mapped_column(String(255), nullable=False)
    category: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    __table_args__ = (
        UniqueConstraint("merchant", "category", name="ux_rule_suggestion_ignores_merchant_category"),
    )


# NOTE: Avoid defining a second mapper for the existing 'rule_suggestions' table
# with a different schema to prevent conflicts with RuleSuggestion above.
# If a persisted store with this schema is needed, prefer a new table name
# (e.g., 'rule_suggestions_persisted') and add a migration accordingly.


# --- NEW: RuleBackfillRun (audit of backfills) -----------------------------
class RuleBackfillRun(Base):
    __tablename__ = "rule_backfill_runs"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    rule_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    filters_json: Mapped[dict] = mapped_column(JSON, nullable=False)
    matched: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    updated: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    dry_run: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="0")
    actor: Mapped[str | None] = mapped_column(String(255), nullable=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

# --- NEW: Auth models (Users / Roles) --------------------------------------
class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="1")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    roles: Mapped[list["UserRole"]] = relationship("UserRole", back_populates="user", cascade="all, delete-orphan")

class Role(Base):
    __tablename__ = "roles"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)

class UserRole(Base):
    __tablename__ = "user_roles"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    role_id: Mapped[int] = mapped_column(Integer, ForeignKey("roles.id", ondelete="CASCADE"), nullable=False)
    __table_args__ = (
        UniqueConstraint("user_id", "role_id", name="uq_user_role"),
    )

    user: Mapped["User"] = relationship("User", back_populates="roles")
    role: Mapped["Role"] = relationship("Role")

# --- NEW: OAuth linked accounts -------------------------------------------
class OAuthAccount(Base):
    __tablename__ = "oauth_accounts"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    provider: Mapped[str] = mapped_column(String(32), nullable=False)  # "github"|"google"
    provider_user_id: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    __table_args__ = (
        UniqueConstraint("provider", "provider_user_id", name="uq_oauth_provider_user"),
    )
