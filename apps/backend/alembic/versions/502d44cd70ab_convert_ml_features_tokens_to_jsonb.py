"""convert_ml_features_tokens_to_jsonb

Converts ml_features.tokens from text[] (Postgres ARRAY) to jsonb for cross-database
compatibility (SQLite + Postgres). The JSON column works in both databases and allows
efficient querying with GIN indexes in Postgres.

Revision ID: 502d44cd70ab
Revises: 20251109_add_user_name_picture
Create Date: 2025-11-12 17:32:54.477881

"""

from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "502d44cd70ab"
down_revision: Union[str, Sequence[str], None] = "20251109_add_user_name_picture"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Convert tokens column from text[] to jsonb in PostgreSQL.

    Uses to_jsonb() for lossless conversion. Adds GIN index for efficient
    containment/membership queries.
    """
    # Check if we're on PostgreSQL (skip for SQLite in tests)
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return

    # 1) Convert text[] to jsonb with lossless casting
    op.execute(
        """
        ALTER TABLE ml_features
        ALTER COLUMN tokens TYPE jsonb
        USING to_jsonb(tokens)
    """
    )

    # 2) Create GIN index with jsonb_ops (default, supports all JSONB operations)
    # CONCURRENTLY requires a separate transaction
    op.execute("COMMIT")
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_ml_features_tokens_gin
        ON ml_features
        USING GIN (tokens jsonb_ops)
    """
    )


def downgrade() -> None:
    """Downgrade jsonb back to text[] array.

    Best-effort conversion: extracts text elements from JSON array.
    Empty/null arrays preserved correctly.
    """
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return

    # 1) Drop GIN index (no CONCURRENTLY needed on downgrade)
    op.execute(
        """
        DROP INDEX IF EXISTS ix_ml_features_tokens_gin
    """
    )

    # 2) Convert jsonb back to text[] using jsonb_array_elements_text
    # COALESCE handles NULL case, empty array preserved
    op.execute(
        """
        ALTER TABLE ml_features
        ALTER COLUMN tokens TYPE text[]
        USING COALESCE(
            ARRAY(SELECT jsonb_array_elements_text(tokens)),
            '{}'::text[]
        )
    """
    )
