"""Add user_id to transactions for multi-user data isolation

Revision ID: 20251107_add_user_id_to_transactions
Revises: 20251105_reconcile_ml_schema
Create Date: 2025-11-07

"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

# revision identifiers, used by Alembic.
revision = "20251107_add_user_id_to_transactions"
down_revision = "20251105_reconcile_ml_schema"
branch_labels = None
depends_on = None


def upgrade():
    """Add user_id column with FK to users table."""
    conn = op.get_bind()
    inspector = inspect(conn)

    # Check if column already exists
    cols = {c["name"] for c in inspector.get_columns("transactions")}
    if "user_id" in cols:
        print("Column user_id already exists, skipping add_column")
        return

    # 1) Add user_id column as nullable initially
    op.add_column("transactions", sa.Column("user_id", sa.Integer, nullable=True))

    # 2) Optional: Backfill with a default user (commented out - handle manually)
    # To backfill, run: UPDATE transactions SET user_id = <YOUR_USER_ID> WHERE user_id IS NULL
    # Example:
    # op.execute("UPDATE transactions SET user_id = 1 WHERE user_id IS NULL")

    # 3) Make user_id NOT NULL (will fail if any NULL values exist - backfill first!)
    # Uncomment after backfilling:
    # op.alter_column("transactions", "user_id", existing_type=sa.Integer, nullable=False)

    # 4) Add FK constraint
    try:
        op.create_foreign_key(
            "fk_transactions_user",
            "transactions",
            "users",
            ["user_id"],
            ["id"],
            ondelete="CASCADE",
        )
    except Exception as e:
        print(f"FK constraint creation skipped or failed: {e}")

    # 5) Add index for performance
    try:
        op.create_index("ix_transactions_user_id", "transactions", ["user_id"])
    except Exception as e:
        print(f"Index creation skipped or failed: {e}")


def downgrade():
    """Remove user_id column and related constraints."""
    conn = op.get_bind()
    inspector = inspect(conn)

    # Drop index
    indexes = {idx["name"] for idx in inspector.get_indexes("transactions")}
    if "ix_transactions_user_id" in indexes:
        op.drop_index("ix_transactions_user_id", table_name="transactions")

    # Drop FK constraint
    try:
        op.drop_constraint("fk_transactions_user", "transactions", type_="foreignkey")
    except Exception as e:
        print(f"FK constraint drop skipped or failed: {e}")

    # Drop column
    cols = {c["name"] for c in inspector.get_columns("transactions")}
    if "user_id" in cols:
        op.drop_column("transactions", "user_id")
