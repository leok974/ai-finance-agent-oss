"""merge heads

Revision ID: 5f780aef3f22
Revises: 20250903_0001, 7d9707fac06d
Create Date: 2025-09-03 12:56:01.022707

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '5f780aef3f22'
down_revision: Union[str, Sequence[str], None] = ('20250903_0001', '7d9707fac06d')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
