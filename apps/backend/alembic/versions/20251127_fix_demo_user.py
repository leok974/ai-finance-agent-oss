"""Fix demo user separation - ensure DEMO_USER_ID=1 has correct email

Revision ID: 20251127_fix_demo_user
Revises: 20251126_add_demo_user_and_flags
Create Date: 2025-11-27

"""

from alembic import op


# revision identifiers, used by Alembic.
revision = "20251127_fix_demo_user"
down_revision = "20251126_add_demo_user_and_flags"
branch_labels = None
depends_on = None


def upgrade():
    """
    Fix demo user separation:
    1. Ensure user ID 1 (DEMO_USER_ID) has demo@ledger-mind.local email
    2. Delete any dev@local users that shouldn't exist
    3. Ensure demo user has is_demo=true and is_demo_user=true
    """
    # Update demo user email (user_id=1 is DEMO_USER_ID from config)
    op.execute(
        """
        UPDATE users
        SET email = 'demo@ledger-mind.local',
            is_demo = true,
            is_demo_user = true
        WHERE id = 1;
    """
    )

    # Delete dev@local users (these were created in error)
    op.execute(
        """
        DELETE FROM users
        WHERE email = 'dev@local';
    """
    )

    # Ensure other demo emails are consistent
    op.execute(
        """
        UPDATE users
        SET is_demo = true
        WHERE email LIKE 'demo@%';
    """
    )


def downgrade():
    """
    Revert to previous state (not recommended - this is a data fix)
    """
    # Note: This doesn't restore deleted dev@local users
    # Only reverts the email change for user_id=1
    op.execute(
        """
        UPDATE users
        SET email = 'dev@local'
        WHERE id = 1;
    """
    )
