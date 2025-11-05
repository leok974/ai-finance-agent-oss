"""add help_cache table for unified Help API (persistent cache + ETag)

Revision ID: 20250927_add_help_cache
Revises: 20250925_ae_partial_idx_fallback
Create Date: 2025-09-27
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "20250927_add_help_cache"
down_revision = "20250925_ae_partial_idx_fallback"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    is_pg = bind.dialect.name == "postgresql"

    if is_pg:
        from sqlalchemy.dialects import postgresql as pg

        op.create_table(
            "help_cache",
            sa.Column("id", sa.Integer, primary_key=True),
            sa.Column("cache_key", sa.String(512), nullable=False, unique=True),
            sa.Column("etag", sa.String(64), nullable=False),
            sa.Column("payload", pg.JSONB, nullable=False),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.text("now()"),
                nullable=False,
            ),
            sa.Column(
                "updated_at",
                sa.DateTime(timezone=True),
                server_default=sa.text("now()"),
                nullable=False,
            ),
        )
    else:
        op.create_table(
            "help_cache",
            sa.Column("id", sa.Integer, primary_key=True),
            sa.Column("cache_key", sa.String(512), nullable=False, unique=True),
            sa.Column("etag", sa.String(64), nullable=False),
            sa.Column("payload", sa.JSON, nullable=False),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        )

    # Indexes (common to both backends)
    op.create_index("ix_help_cache_cache_key", "help_cache", ["cache_key"], unique=True)
    op.create_index("ix_help_cache_etag", "help_cache", ["etag"])
    op.create_index("ix_help_cache_expires_at", "help_cache", ["expires_at"])
    # Composite for eviction scans
    op.create_index(
        "ix_help_cache_expires_key", "help_cache", ["expires_at", "cache_key"]
    )


def downgrade() -> None:
    for idx in [
        "ix_help_cache_expires_key",
        "ix_help_cache_expires_at",
        "ix_help_cache_etag",
        "ix_help_cache_cache_key",
    ]:
        try:
            op.drop_index(idx, table_name="help_cache", if_exists=True)  # type: ignore[arg-type]
        except TypeError:
            try:
                op.drop_index(idx, table_name="help_cache")
            except Exception:
                pass
    op.drop_table("help_cache")
