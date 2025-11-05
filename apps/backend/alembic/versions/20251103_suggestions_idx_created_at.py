"""Add performance index on suggestion_events.created_at

Revision ID: 20251103_suggestions_idx_created_at
Revises: 20251103_suggestions_fk
Create Date: 2025-11-03 16:00:00.000000

"""

from alembic import op

# revision identifiers, used by Alembic.
revision = "20251103_suggestions_idx_created_at"
down_revision = "20251103_suggestions_fk"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add index on created_at for time-based queries and analytics."""
    op.create_index(
        "ix_suggestion_events_created_at",
        "suggestion_events",
        ["created_at"],
        if_not_exists=True,
    )


def downgrade() -> None:
    """Remove created_at index."""
    op.drop_index("ix_suggestion_events_created_at", table_name="suggestion_events")
