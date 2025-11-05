"""merge heads: merchant_canonical + budgets

Revision ID: abe2433f913d
Revises: 20250909_add_merchant_canonical, 20250910_add_budgets_table
Create Date: 2025-09-10 14:55:06.080595

"""

from typing import Sequence, Union


# revision identifiers, used by Alembic.
revision: str = "abe2433f913d"
down_revision: Union[str, Sequence[str], None] = (
    "20250909_add_merchant_canonical",
    "20250910_add_budgets_table",
)
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
