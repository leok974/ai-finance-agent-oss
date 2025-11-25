"""add_is_demo_to_transactions

Revision ID: 20251124_add_is_demo_to_transactions
Revises: e4ed2d9d0cbc
Create Date: 2025-11-24 18:40:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "20251124_add_is_demo_to_transactions"
down_revision: Union[str, None] = "e4ed2d9d0cbc"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add is_demo column to transactions table for demo data isolation."""
    from sqlalchemy import inspect

    bind = op.get_bind()
    inspector = inspect(bind)
    existing_columns = {col["name"] for col in inspector.get_columns("transactions")}

    # Add is_demo column (default False for existing transactions - they are real user data)
    if "is_demo" not in existing_columns:
        op.add_column(
            "transactions",
            sa.Column("is_demo", sa.Boolean(), nullable=False, server_default="0"),
        )

    # Add index on is_demo for efficient filtering (critical for training data queries)
    existing_indexes = {idx["name"] for idx in inspector.get_indexes("transactions")}
    if "ix_transactions_is_demo" not in existing_indexes:
        op.create_index("ix_transactions_is_demo", "transactions", ["is_demo"])


def downgrade() -> None:
    """Remove is_demo column and index from transactions table."""
    op.drop_index("ix_transactions_is_demo", table_name="transactions")
    op.drop_column("transactions", "is_demo")
