"""merge_demo_with_main

Revision ID: e4ed2d9d0cbc
Revises: 20251111_add_is_demo_to_users, fe374f90af1f
Create Date: 2025-11-21 14:15:23.884587

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e4ed2d9d0cbc'
down_revision: Union[str, Sequence[str], None] = ('20251111_add_is_demo_to_users', 'fe374f90af1f')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
