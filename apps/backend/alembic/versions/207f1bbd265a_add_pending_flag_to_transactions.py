"""add pending flag to transactions

Revision ID: 207f1bbd265a
Revises: 502d44cd70ab
Create Date: 2025-11-18 12:51:02.786323

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '207f1bbd265a'
down_revision: Union[str, Sequence[str], None] = '502d44cd70ab'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "transactions",
        sa.Column("pending", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("transactions", "pending")
