"""merge heads after feedback timestamp + standardization

Revision ID: c4a739e0f055
Revises: 20250909_feedback_created_at_not_null, b4068fc306b1
Create Date: 2025-09-09 19:06:53.331963

"""

from typing import Sequence, Union


# revision identifiers, used by Alembic.
revision: str = "c4a739e0f055"
down_revision: Union[str, Sequence[str], None] = (
    "20250909_feedback_created_at_not_null",
    "b4068fc306b1",
)
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
