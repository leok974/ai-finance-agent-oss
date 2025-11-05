"""merge heads (feedback + 62bc5ef49a22)

Revision ID: 0099b510f0cc
Revises: 20250908_add_feedback, 62bc5ef49a22
Create Date: 2025-09-08 18:24:43.754336

"""

from typing import Sequence, Union


# revision identifiers, used by Alembic.
revision: str = "0099b510f0cc"
down_revision: Union[str, Sequence[str], None] = (
    "20250908_add_feedback",
    "62bc5ef49a22",
)
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
