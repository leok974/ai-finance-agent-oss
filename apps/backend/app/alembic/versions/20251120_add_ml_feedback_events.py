"""
Add ml_feedback_events table for tracking user feedback on ML suggestions.

Revision ID: 20251120_add_ml_feedback_events
Revises: 20250915_idx_enc_label
Create Date: 2025-11-20
"""

from alembic import op
import sqlalchemy as sa


revision = "20251120_add_ml_feedback_events"
down_revision = "20250915_idx_enc_label"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "ml_feedback_events",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("txn_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.String(), nullable=True),
        sa.Column("category", sa.String(length=128), nullable=False),
        sa.Column("action", sa.String(length=16), nullable=False),
        sa.Column("score", sa.Float(), nullable=True),
        sa.Column("model", sa.String(length=128), nullable=True),
        sa.Column("source", sa.String(length=64), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )

    op.create_index("ix_ml_feedback_events_txn_id", "ml_feedback_events", ["txn_id"])
    op.create_index("ix_ml_feedback_events_user_id", "ml_feedback_events", ["user_id"])
    op.create_index(
        "ix_ml_feedback_events_category", "ml_feedback_events", ["category"]
    )
    op.create_index("ix_ml_feedback_events_action", "ml_feedback_events", ["action"])
    op.create_index(
        "ix_ml_feedback_events_created_at", "ml_feedback_events", ["created_at"]
    )


def downgrade() -> None:
    op.drop_index("ix_ml_feedback_events_created_at", table_name="ml_feedback_events")
    op.drop_index("ix_ml_feedback_events_action", table_name="ml_feedback_events")
    op.drop_index("ix_ml_feedback_events_category", table_name="ml_feedback_events")
    op.drop_index("ix_ml_feedback_events_user_id", table_name="ml_feedback_events")
    op.drop_index("ix_ml_feedback_events_txn_id", table_name="ml_feedback_events")
    op.drop_table("ml_feedback_events")
