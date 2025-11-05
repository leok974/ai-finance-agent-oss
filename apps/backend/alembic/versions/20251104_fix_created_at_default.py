"""Add server default to suggestion_feedback.created_at

Revision ID: 20251104_fix_created_at
Revises: 20251104_feedback_schema
Create Date: 2025-11-04 18:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "20251104_fix_created_at"
down_revision = "20251104_feedback_schema"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add server default to created_at column
    op.alter_column(
        "suggestion_feedback",
        "created_at",
        existing_type=sa.DateTime(),
        server_default=sa.func.now(),
        nullable=False,
    )


def downgrade() -> None:
    # Remove server default from created_at column
    op.alter_column(
        "suggestion_feedback",
        "created_at",
        existing_type=sa.DateTime(),
        server_default=None,
        nullable=False,
    )
