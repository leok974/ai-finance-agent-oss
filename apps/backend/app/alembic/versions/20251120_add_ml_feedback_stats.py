"""
Add ml_feedback_merchant_category_stats table for aggregate feedback statistics.

Revision ID: 20251120_add_ml_feedback_stats
Revises: 20251120_add_ml_feedback_events
Create Date: 2025-11-20
"""

from alembic import op
import sqlalchemy as sa


revision = "20251120_add_ml_feedback_stats"
down_revision = "20251120_add_ml_feedback_events"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "ml_feedback_merchant_category_stats",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("merchant_normalized", sa.String(length=255), nullable=False),
        sa.Column("category", sa.String(length=128), nullable=False),
        sa.Column("accept_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("reject_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "last_feedback_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.UniqueConstraint(
            "merchant_normalized",
            "category",
            name="uq_ml_feedback_merchant_category",
        ),
    )


def downgrade() -> None:
    op.drop_table("ml_feedback_merchant_category_stats")
