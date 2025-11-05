"""add descending index on transactions.date for fast MAX(date)

Revision ID: 20251002_add_idx_txn_date
Revises: 20250927_add_help_cache
Create Date: 2025-10-02
"""

from alembic import op

# revision identifiers, used by Alembic.
revision = "20251002_add_idx_txn_date"
down_revision = "20250927_add_help_cache"
branch_labels = None
depends_on = None


def upgrade():  # type: ignore[override]
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute(
            "CREATE INDEX IF NOT EXISTS ix_transactions_date_desc ON transactions (date DESC)"
        )
    else:
        # SQLite ignores DESC in index expression; create simple index if not exists
        try:
            op.execute(
                "CREATE INDEX IF NOT EXISTS ix_transactions_date_desc ON transactions (date)"
            )
        except Exception:
            pass


def downgrade():  # type: ignore[override]
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("DROP INDEX IF EXISTS ix_transactions_date_desc")
    else:
        try:
            op.execute("DROP INDEX IF EXISTS ix_transactions_date_desc")
        except Exception:
            pass
