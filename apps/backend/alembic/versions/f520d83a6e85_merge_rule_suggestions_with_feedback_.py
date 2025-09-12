"""merge rule_suggestions with feedback-merge

Revision ID: f520d83a6e85
Revises: 20250908_merge_feedback_and_62bc5ef49a22, 20250909_add_rule_suggestions
Create Date: 2025-09-09 01:10:00.716377

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f520d83a6e85'
down_revision: Union[str, Sequence[str], None] = ('20250908_merge_feedback_and_62bc5ef49a22', '20250909_add_rule_suggestions')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
