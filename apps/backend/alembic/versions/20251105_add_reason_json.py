"""Add reason_json and acceptance tracking to suggestions.

Revision ID: 20251105_add_reason_json
Revises:
Create Date: 2025-11-05 21:50:00.000000

"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "20251105_add_reason_json"
down_revision = "20251104_seed_labels_from_rules"  # Point to latest migration
branch_labels = None
depends_on = None


def upgrade():
    """Add reason_json, accepted, and mode columns to suggestions table."""
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    # Check if table exists
    if not bind.dialect.has_table(bind, "suggestions"):
        return

    # Get existing columns
    existing_columns = {col['name'] for col in inspector.get_columns("suggestions")}

    with op.batch_alter_table("suggestions", schema=None) as batch_op:
        # Add reason_json for explainability (only if doesn't exist)
        if "reason_json" not in existing_columns:
            batch_op.add_column(sa.Column("reason_json", sa.JSON(), nullable=True))
        # Add accepted flag for user feedback (only if doesn't exist)
        if "accepted" not in existing_columns:
            batch_op.add_column(sa.Column("accepted", sa.Boolean(), nullable=True))
        # Add mode to distinguish model/rule/ask (only if doesn't exist)
        if "mode" not in existing_columns:
            batch_op.add_column(sa.Column("mode", sa.String(length=16), nullable=True))


def downgrade():
    """Remove reason_json, accepted, and mode columns."""
    with op.batch_alter_table("suggestions", schema=None) as batch_op:
        for col in ("mode", "accepted", "reason_json"):
            try:
                batch_op.drop_column(col)
            except Exception:
                # Column might not exist
                pass
