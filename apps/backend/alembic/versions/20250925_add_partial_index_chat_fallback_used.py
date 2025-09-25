"""add partial index on analytics_events(event='chat_fallback_used') [Postgres]

Revision ID: 20250925_ae_partial_idx_fallback
Revises: 20250925_add_analytics
Create Date: 2025-09-25
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '20250925_ae_partial_idx_fallback'
down_revision = '20250925_add_analytics'
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_ae_fallback_event
            ON analytics_events (server_ts)
            WHERE event = 'chat_fallback_used';
            """
        )


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("DROP INDEX IF EXISTS idx_ae_fallback_event;")
