"""add analytics_events table (Postgres-aware)

Revision ID: 20250925_add_analytics
Revises: c4a739e0f055
Create Date: 2025-09-25
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import text

# revision identifiers, used by Alembic.
revision = '20250925_add_analytics'
down_revision = 'c4a739e0f055'
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    is_pg = bind.dialect.name == "postgresql"

    if is_pg:
        from sqlalchemy.dialects import postgresql as pg
        op.create_table(
            "analytics_events",
            sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
            sa.Column("event", sa.Text, nullable=False),
            sa.Column("props_json", pg.JSONB, server_default=sa.text("'{}'::jsonb"), nullable=False),
            sa.Column("client_ts", sa.BigInteger),
            sa.Column("server_ts", sa.BigInteger, server_default=sa.text("(extract(epoch from now())*1000)::bigint"), nullable=False),
            sa.Column("rid", sa.Text),
            sa.Column("path", sa.Text),
            sa.Column("ip", pg.INET),
            sa.Column("ua", sa.Text),
            sa.CheckConstraint("char_length(event) <= 64", name="chk_event_len"),
        )
        op.create_index("idx_ae_event", "analytics_events", ["event"])
        op.create_index("idx_ae_server_ts", "analytics_events", ["server_ts"])
        # GIN index on props_json for fast property queries
        op.create_index("idx_ae_props_gin", "analytics_events", [sa.text("props_json")], postgresql_using="gin")
    else:
        # SQLite/dev fallback
        op.create_table(
            "analytics_events",
            sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
            sa.Column("event", sa.Text, nullable=False),
            sa.Column("props_json", sa.JSON, server_default=sa.text("'{}'"), nullable=False),
            sa.Column("client_ts", sa.BigInteger),
            sa.Column("server_ts", sa.BigInteger, nullable=False),
            sa.Column("rid", sa.Text),
            sa.Column("path", sa.Text),
            sa.Column("ip", sa.String(64)),
            sa.Column("ua", sa.Text),
        )
        op.create_index("idx_ae_event", "analytics_events", ["event"])
        op.create_index("idx_ae_server_ts", "analytics_events", ["server_ts"])


def downgrade() -> None:
    # Use if_exists for robustness across environments
    try:
        op.drop_index("idx_ae_props_gin", table_name="analytics_events", if_exists=True)  # type: ignore[arg-type]
    except TypeError:
        # Older Alembic may not support if_exists
        try:
            op.drop_index("idx_ae_props_gin", table_name="analytics_events")
        except Exception:
            pass
    for idx in ("idx_ae_server_ts", "idx_ae_event"):
        try:
            op.drop_index(idx, table_name="analytics_events", if_exists=True)  # type: ignore[arg-type]
        except TypeError:
            try:
                op.drop_index(idx, table_name="analytics_events")
            except Exception:
                pass
    op.drop_table("analytics_events")
