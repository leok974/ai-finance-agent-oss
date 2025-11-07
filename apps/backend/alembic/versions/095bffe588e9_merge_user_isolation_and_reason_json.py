"""merge_user_isolation_and_reason_json

Revision ID: 095bffe588e9
Revises: 20251105_add_reason_json, 20251107_add_user_id_to_transactions
Create Date: 2025-11-07 12:18:31.221789

"""

from typing import Sequence, Union


# revision identifiers, used by Alembic.
revision: str = "095bffe588e9"
down_revision: Union[str, Sequence[str], None] = (
    "20251105_add_reason_json",
    "20251107_add_user_id_to_transactions",
)
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
