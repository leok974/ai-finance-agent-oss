"""Rule suggestions & ignores persistence (placeholder)

Revision ID: 20250910_rule_suggestions
Revises: 20250910_add_budgets_table
Create Date: 2025-09-10

NOTE:
    This migration is intentionally a no-op placeholder to keep the revision
    chain consistent while persisted suggestions are implemented in-memory.
    The actual tables may be introduced in a future migration without breaking
    the API surface.
"""

# revision identifiers, used by Alembic.
revision = "20250910_rule_suggestions"
down_revision = "abe2433f913d"
branch_labels = None
depends_on = None


def upgrade():
    # No-op placeholder
    pass


def downgrade():
    # No-op placeholder
    pass
