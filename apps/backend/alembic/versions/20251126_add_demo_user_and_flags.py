"""
Add demo user and explicit source/demo flags to separate real from demo data.

Revision ID: 20251126_add_demo_user_and_flags
Revises: 20251124_add_is_demo_to_transactions
Create Date: 2025-11-26
"""

from alembic import op
import sqlalchemy as sa


revision = "20251126_add_demo_user_and_flags"
down_revision = "20251124_add_is_demo_to_transactions"
branch_labels = None
depends_on = None


def has_column(table_name: str, column_name: str) -> bool:
    """Check if a column exists in a table."""
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    columns = [col["name"] for col in inspector.get_columns(table_name)]
    return column_name in columns


def upgrade() -> None:
    # 1. Add source column to transactions (upload/demo/import/etc.)
    if not has_column("transactions", "source"):
        op.add_column(
            "transactions",
            sa.Column("source", sa.String(length=32), nullable=True),
        )

    # 2. Add is_demo_user flag to users if not present
    if not has_column("users", "is_demo_user"):
        op.add_column(
            "users",
            sa.Column(
                "is_demo_user",
                sa.Boolean(),
                nullable=False,
                server_default="0",
            ),
        )

    # 3. Insert dedicated demo user (safely handle if ID 1 is taken)
    conn = op.get_bind()

    # Check if demo user already exists
    result = conn.execute(
        sa.text("SELECT id FROM users WHERE email = 'demo@ledger-mind.local' LIMIT 1")
    )
    existing_demo = result.fetchone()

    if not existing_demo:
        # Check if ID 1 is available
        result = conn.execute(sa.text("SELECT id FROM users WHERE id = 1 LIMIT 1"))
        id_1_taken = result.fetchone()

        # Get current timestamp for created_at (SQLite compatible)
        from datetime import datetime

        now_utc = datetime.utcnow().isoformat()

        if id_1_taken:
            # ID 1 is taken, let DB auto-assign
            conn.execute(
                sa.text(
                    """
                    INSERT INTO users (email, name, password_hash, is_demo_user, is_active, is_demo, created_at)
                    VALUES ('demo@ledger-mind.local', 'LedgerMind Demo', 'DEMO_NO_PASSWORD', 1, 1, 1, :created_at)
                    """
                ),
                {"created_at": now_utc},
            )
        else:
            # ID 1 is free, use it
            conn.execute(
                sa.text(
                    """
                    INSERT INTO users (id, email, name, password_hash, is_demo_user, is_active, is_demo, created_at)
                    VALUES (1, 'demo@ledger-mind.local', 'LedgerMind Demo', 'DEMO_NO_PASSWORD', 1, 1, 1, :created_at)
                    """
                ),
                {"created_at": now_utc},
            )

    # 4. Backfill existing demo transactions
    # Mark all transactions with is_demo=1 as source='demo'
    conn.execute(
        sa.text(
            """
            UPDATE transactions
            SET source = 'demo'
            WHERE is_demo = 1 AND (source IS NULL OR source != 'demo')
            """
        )
    )

    # Mark all non-demo transactions as source='upload' (best guess for historical data)
    conn.execute(
        sa.text(
            """
            UPDATE transactions
            SET source = 'upload'
            WHERE is_demo = 0 AND source IS NULL
            """
        )
    )


def downgrade() -> None:
    # Remove source column from transactions
    if has_column("transactions", "source"):
        op.drop_column("transactions", "source")

    # Remove is_demo_user flag from users
    if has_column("users", "is_demo_user"):
        op.drop_column("users", "is_demo_user")

    # Note: We don't delete the demo user to avoid data loss
    # Admin can manually clean up if needed
