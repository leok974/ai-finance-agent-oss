"""Update suggestion_feedback schema with txn_id and label columns

Revision ID: 20251104_feedback_schema
Revises: 20251104_tenants_canary_pct
Create Date: 2025-11-04 15:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '20251104_feedback_schema'
down_revision: Union[str, None] = '20251104_tenants_canary_pct'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create enum type for action
    suggestion_action = postgresql.ENUM('accept', 'reject', name='suggestion_action', create_type=True)
    suggestion_action.create(op.get_bind(), checkfirst=True)

    # Make event_id nullable (was NOT NULL before)
    op.alter_column('suggestion_feedback', 'event_id',
               existing_type=postgresql.UUID(),
               nullable=True)

    # Add new columns
    op.add_column('suggestion_feedback', sa.Column('txn_id', sa.Integer(), nullable=True))  # nullable first for migration
    op.add_column('suggestion_feedback', sa.Column('label', sa.String(length=128), nullable=True))  # nullable first
    op.add_column('suggestion_feedback', sa.Column('confidence', sa.Float(), nullable=True))
    op.add_column('suggestion_feedback', sa.Column('user_id', sa.String(length=128), nullable=True))

    # Migrate existing data: if event_id exists, get txn_id from suggestion_events
    # For rows where event_id is not null, populate txn_id and set a default label
    op.execute("""
        UPDATE suggestion_feedback sf
        SET txn_id = se.txn_id,
            label = COALESCE(sf.action, 'Unknown')
        FROM suggestion_events se
        WHERE sf.event_id = se.id AND sf.txn_id IS NULL
    """)

    # For any remaining rows without event_id (shouldn't exist in current schema, but be safe)
    # Set a placeholder txn_id = 0 (will need manual cleanup if this happens)
    op.execute("""
        UPDATE suggestion_feedback
        SET txn_id = 0, label = COALESCE(action, 'Unknown')
        WHERE txn_id IS NULL
    """)

    # Now make txn_id and label NOT NULL
    op.alter_column('suggestion_feedback', 'txn_id', nullable=False)
    op.alter_column('suggestion_feedback', 'label', nullable=False)

    # Convert action column from String to Enum
    # First ensure all values are valid (accept/reject)
    op.execute("""
        UPDATE suggestion_feedback
        SET action = CASE
            WHEN action = 'undo' THEN 'reject'
            WHEN action NOT IN ('accept', 'reject') THEN 'reject'
            ELSE action
        END
    """)

    # Drop old column and add new enum column
    op.drop_column('suggestion_feedback', 'action')
    op.add_column('suggestion_feedback', sa.Column('action', suggestion_action, nullable=False, server_default='reject'))

    # Remove user_ts column (not in new schema)
    op.drop_column('suggestion_feedback', 'user_ts')

    # Add indexes
    op.create_index('ix_suggestion_feedback_txn_id', 'suggestion_feedback', ['txn_id'], unique=False)
    op.create_index('ix_suggestion_feedback_action', 'suggestion_feedback', ['action'], unique=False)
    op.create_index('ix_suggestion_feedback_created_at', 'suggestion_feedback', ['created_at'], unique=False)


def downgrade() -> None:
    # Drop indexes
    op.drop_index('ix_suggestion_feedback_created_at', table_name='suggestion_feedback')
    op.drop_index('ix_suggestion_feedback_action', table_name='suggestion_feedback')
    op.drop_index('ix_suggestion_feedback_txn_id', table_name='suggestion_feedback')

    # Add back user_ts
    op.add_column('suggestion_feedback', sa.Column('user_ts', postgresql.TIMESTAMP(), autoincrement=False, nullable=True))

    # Revert action to String
    op.drop_column('suggestion_feedback', 'action')
    op.add_column('suggestion_feedback', sa.Column('action', sa.VARCHAR(), autoincrement=False, nullable=False))

    # Drop new columns
    op.drop_column('suggestion_feedback', 'user_id')
    op.drop_column('suggestion_feedback', 'confidence')
    op.drop_column('suggestion_feedback', 'label')
    op.drop_column('suggestion_feedback', 'txn_id')

    # Revert event_id to NOT NULL
    op.alter_column('suggestion_feedback', 'event_id',
               existing_type=postgresql.UUID(),
               nullable=False)

    # Drop enum type
    suggestion_action = postgresql.ENUM('accept', 'reject', name='suggestion_action')
    suggestion_action.drop(op.get_bind(), checkfirst=True)
