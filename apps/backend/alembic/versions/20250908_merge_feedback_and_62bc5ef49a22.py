"""merge heads (feedback + 62bc5ef49a22)

Revision ID: 20250908_merge_feedback_and_62bc5ef49a22
Revises: 20250908_add_feedback, 62bc5ef49a22
Create Date: 2025-09-08 17:10:00.000000
"""

# Revision identifiers, used by Alembic.
revision = "20250908_merge_feedback_and_62bc5ef49a22"
down_revision = ("20250908_add_feedback", "62bc5ef49a22")
branch_labels = None
depends_on = None


def upgrade():
    # Nothing to do, this just merges history
    pass


def downgrade():
    # Nothing to undo, this just merges history
    pass
