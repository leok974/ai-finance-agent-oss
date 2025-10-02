"""merge heads

Revision ID: ae14ab438627
Revises: 20250910_oauth_accounts, 20250913_txns_mgmt_soft_delete_split_transfer
Create Date: 2025-09-14 20:06:24.271964

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'ae14ab438627'
down_revision: Union[str, Sequence[str], None] = ('20250910_oauth_accounts', '20250913_txns_mgmt_soft_delete_split_transfer')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
