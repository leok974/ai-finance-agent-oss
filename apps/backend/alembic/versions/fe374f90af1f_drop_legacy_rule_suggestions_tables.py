"""drop_legacy_rule_suggestions_tables

Revision ID: fe374f90af1f
Revises: 26d77a0f50f6
Create Date: 2025-11-20 17:19:48.395624

"""

from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "fe374f90af1f"
down_revision: Union[str, Sequence[str], None] = "26d77a0f50f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Drop legacy rule_suggestions and rule_suggestion_ignores tables.

    These tables were part of the legacy rule suggestions system that has been
    replaced by the ML feedback system (ml_feedback_events, merchant_category_hints).
    """
    # Drop legacy tables
    op.execute("DROP TABLE IF EXISTS rule_suggestion_ignores CASCADE;")
    op.execute("DROP TABLE IF EXISTS rule_suggestions CASCADE;")


def downgrade() -> None:
    """Recreate legacy rule_suggestions tables.

    Note: This only recreates the schema, not the data.
    """
    # Recreate rule_suggestions table
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS rule_suggestions (
            id SERIAL PRIMARY KEY,
            merchant_norm VARCHAR(255) NOT NULL,
            category VARCHAR(255) NOT NULL,
            support INTEGER NOT NULL DEFAULT 0,
            positive_rate FLOAT NOT NULL DEFAULT 0.0,
            last_seen TIMESTAMP,
            created_at TIMESTAMP DEFAULT NOW(),
            UNIQUE(merchant_norm, category)
        );
    """
    )

    # Recreate rule_suggestion_ignores table
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS rule_suggestion_ignores (
            id SERIAL PRIMARY KEY,
            merchant VARCHAR(255) NOT NULL,
            category VARCHAR(255) NOT NULL,
            created_at TIMESTAMP DEFAULT NOW(),
            UNIQUE(merchant, category)
        );
    """
    )

    # Recreate indexes
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_rule_suggestions_merchant ON rule_suggestions(merchant_norm);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_rule_suggestions_category ON rule_suggestions(category);"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_rule_suggestion_ignores_merchant ON rule_suggestion_ignores(merchant);"
    )
