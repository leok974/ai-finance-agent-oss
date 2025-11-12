"""Reconcile ML schema: add missing columns/tables conditionally.

This migration safely adds missing tables and columns needed for ML Pipeline Phase 2.1
without destroying existing data. Works across SQLite and PostgreSQL.

Revision ID: 20251105_reconcile_ml_schema
Revises: 20251104_seed_labels_from_rules
Create Date: 2025-11-05 22:20:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

# revision identifiers, used by Alembic.
revision = "20251105_reconcile_ml_schema"
down_revision = "20251104_seed_labels_from_rules"
branch_labels = None
depends_on = None


def has_table(bind, name: str) -> bool:
    """Check if table exists in database."""
    insp = inspect(bind)
    return name in insp.get_table_names()


def has_column(bind, table: str, col: str) -> bool:
    """Check if column exists in table."""
    insp = inspect(bind)
    if table not in insp.get_table_names():
        return False
    return col in [c["name"] for c in insp.get_columns(table)]


def add_col_if_missing(table: str, col: sa.Column):
    """Add column to table if it doesn't already exist."""
    bind = op.get_bind()
    if not has_table(bind, table):
        return
    if not has_column(bind, table, col.name):
        with op.batch_alter_table(table) as b:
            b.add_column(col)


def create_suggestions_if_missing():
    """Create suggestions table if it doesn't exist."""
    bind = op.get_bind()
    if has_table(bind, "suggestions"):
        return
    op.create_table(
        "suggestions",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("txn_id", sa.String(64), nullable=False, index=True),
        sa.Column("label", sa.String(128), nullable=False, index=True),
        sa.Column("confidence", sa.Float, nullable=False, server_default="0"),
        sa.Column("reason_json", sa.JSON, nullable=True),
        sa.Column("accepted", sa.Boolean, nullable=True, index=True),
        sa.Column("model_version", sa.String(64), nullable=True),
        sa.Column(
            "source", sa.String(32), nullable=False, server_default="model", index=True
        ),
        sa.Column("mode", sa.String(16), nullable=True, index=True),
        sa.Column(
            "timestamp",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
            index=True,
        ),
    )
    op.create_index(
        "ix_suggestions_source_accepted", "suggestions", ["source", "accepted"]
    )
    op.create_index(
        "ix_suggestions_timestamp_label", "suggestions", ["timestamp", "label"]
    )


def create_suggestion_events_if_missing():
    """Create suggestion_events table if it doesn't exist (SQLite-compatible)."""
    bind = op.get_bind()
    if has_table(bind, "suggestion_events"):
        return
    op.create_table(
        "suggestion_events",
        sa.Column("id", sa.String(36), primary_key=True),  # UUID as string for SQLite
        sa.Column("txn_id", sa.Integer(), nullable=False, index=True),
        sa.Column("model_id", sa.String(), nullable=True),
        sa.Column("features_hash", sa.String(), nullable=True),
        sa.Column("candidates", sa.JSON(), nullable=False),  # JSON instead of JSONB
        sa.Column("mode", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    # Only create indexes if they don't already exist
    insp = inspect(bind)
    existing_indexes = [idx["name"] for idx in insp.get_indexes("suggestion_events")]
    if "ix_suggestion_events_txn_id" not in existing_indexes:
        op.create_index("ix_suggestion_events_txn_id", "suggestion_events", ["txn_id"])
    if "ix_suggestion_events_created_at" not in existing_indexes:
        op.create_index(
            "ix_suggestion_events_created_at", "suggestion_events", ["created_at"]
        )


def upgrade():
    """Add missing tables and columns for ML Pipeline Phase 2.1."""
    bind = op.get_bind()

    # Ensure suggestions table exists (used by logging + eval)
    create_suggestions_if_missing()

    # Ensure suggestion_events table exists (used by API for tracking)
    create_suggestion_events_if_missing()

    # Feedback.merchant (optional; helps analytics)
    add_col_if_missing("feedback", sa.Column("merchant", sa.String(256), nullable=True))
    add_col_if_missing(
        "feedback", sa.Column("model_pred", sa.String(128), nullable=True)
    )
    add_col_if_missing(
        "feedback",
        sa.Column("decision", sa.String(32), nullable=False, server_default="correct"),
    )
    add_col_if_missing(
        "feedback", sa.Column("weight", sa.Float, nullable=False, server_default="1.0")
    )
    add_col_if_missing("feedback", sa.Column("month", sa.String(7), nullable=True))

    # Pick ONE label source; if neither exists, create transaction_labels minimal table
    if not has_table(bind, "user_labels") and not has_table(bind, "transaction_labels"):
        op.create_table(
            "transaction_labels",
            sa.Column("id", sa.Integer, primary_key=True),
            sa.Column("txn_id", sa.Integer, nullable=False, index=True),
            sa.Column("label", sa.String(64), nullable=False),
            sa.Column(
                "source", sa.String(32), nullable=True
            ),  # 'user'|'rule'|'model'|'agent'
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.text("CURRENT_TIMESTAMP"),
            ),
        )
        op.create_index(
            "ix_transaction_labels_txn_id", "transaction_labels", ["txn_id"]
        )

    # Transactions minimal columns we rely on
    add_col_if_missing("transactions", sa.Column("month", sa.String(7), nullable=True))
    add_col_if_missing(
        "transactions", sa.Column("merchant", sa.String(256), nullable=True)
    )
    add_col_if_missing("transactions", sa.Column("description", sa.Text, nullable=True))
    add_col_if_missing(
        "transactions", sa.Column("tenant_id", sa.Integer, nullable=True, index=True)
    )


def downgrade():
    """Non-destructive: leave added columns/tables in place."""
    pass
