"""add_is_demo_to_users

Revision ID: 20251111_add_is_demo_to_users
Revises: 20251109_add_user_name_picture
Create Date: 2025-11-11 00:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "20251111_add_is_demo_to_users"
down_revision: Union[str, None] = "20251109_add_user_name_picture"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add is_demo column to users table for demo login feature."""
    # Check if column exists before adding (idempotent)
    from sqlalchemy import inspect

    bind = op.get_bind()
    inspector = inspect(bind)
    existing_columns = {col["name"] for col in inspector.get_columns("users")}

    # Add is_demo column (default False for existing users)
    if "is_demo" not in existing_columns:
        op.add_column(
            "users",
            sa.Column("is_demo", sa.Boolean(), nullable=False, server_default="0"),
        )

    # Add index on is_demo for efficient filtering
    existing_indexes = {idx["name"] for idx in inspector.get_indexes("users")}
    if "ix_users_is_demo" not in existing_indexes:
        op.create_index("ix_users_is_demo", "users", ["is_demo"])


def downgrade() -> None:
    """Remove is_demo column and index from users table."""
    op.drop_index("ix_users_is_demo", table_name="users")
    op.drop_column("users", "is_demo")
