"""permanently_delete_dev_local_user

Revision ID: 5558c97ee45b
Revises: 20251127_fix_demo_user
Create Date: 2025-11-27 08:59:57.727588

"""

from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "5558c97ee45b"
down_revision: Union[str, Sequence[str], None] = "20251127_fix_demo_user"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Permanently delete dev@local user to prevent OAuth conflicts.

    The dev@local user was used for development bypass but conflicts with
    production OAuth flows. This migration ensures it's deleted and stays deleted.
    """
    # Delete OAuth accounts first (foreign key constraint)
    op.execute(
        """
        DELETE FROM oauth_accounts
        WHERE user_id IN (SELECT id FROM users WHERE email = 'dev@local');
    """
    )

    # Delete the dev@local user
    op.execute(
        """
        DELETE FROM users WHERE email = 'dev@local';
    """
    )


def downgrade() -> None:
    """No downgrade - dev@local should not be recreated."""
    pass
