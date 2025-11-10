"""add_user_name_picture

Revision ID: 20251109_add_user_name_picture
Revises: 095bffe588e9
Create Date: 2025-11-09 16:45:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '20251109_add_user_name_picture'
down_revision: Union[str, None] = '095bffe588e9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add name and picture columns to users table for OAuth profile data."""
    # Check if columns exist before adding (idempotent)
    from sqlalchemy import inspect
    bind = op.get_bind()
    inspector = inspect(bind)
    existing_columns = {col['name'] for col in inspector.get_columns('users')}
    
    # Add name column (nullable for existing users)
    if 'name' not in existing_columns:
        op.add_column('users', sa.Column('name', sa.String(length=255), nullable=True))
    
    # Add picture column (nullable for existing users)
    if 'picture' not in existing_columns:
        op.add_column('users', sa.Column('picture', sa.String(length=512), nullable=True))


def downgrade() -> None:
    """Remove name and picture columns from users table."""
    op.drop_column('users', 'picture')
    op.drop_column('users', 'name')
