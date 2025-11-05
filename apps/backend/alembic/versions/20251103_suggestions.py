"""Add suggestion events and feedback tables

Revision ID: 20251103_suggestions
Revises: 20251103_preserve_ml
Create Date: 2025-11-03 12:00:00.000000

"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "20251103_suggestions"
down_revision = "20251103_preserve_ml"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create suggestion_events table
    op.create_table(
        "suggestion_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("txn_id", sa.Integer(), nullable=False, index=True),
        sa.Column("model_id", sa.String(), nullable=True),
        sa.Column("features_hash", sa.String(), nullable=True),
        sa.Column("candidates", postgresql.JSONB(), nullable=False),
        sa.Column("mode", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )

    # Create suggestion_feedback table
    op.create_table(
        "suggestion_feedback",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "event_id", postgresql.UUID(as_uuid=True), nullable=False, index=True
        ),
        sa.Column("action", sa.String(), nullable=False),
        sa.Column("reason", sa.String(), nullable=True),
        sa.Column("user_ts", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["event_id"],
            ["suggestion_events.id"],
        ),
    )


def downgrade() -> None:
    op.drop_table("suggestion_feedback")
    op.drop_table("suggestion_events")
