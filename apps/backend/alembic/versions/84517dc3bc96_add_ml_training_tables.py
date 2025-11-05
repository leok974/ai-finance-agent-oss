"""add_ml_training_tables

Revision ID: 84517dc3bc96
Revises: 20251104_fk_feedback_event_cascade
Create Date: 2025-11-04 21:38:13.549446

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '84517dc3bc96'
down_revision: Union[str, Sequence[str], None] = '20251104_fk_feedback_event_cascade'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema - Add ML training infrastructure tables."""
    
    # 1) Golden labels (human-approved categories)
    op.create_table(
        'transaction_labels',
        sa.Column('txn_id', sa.Integer(), nullable=False),
        sa.Column('label', sa.Text(), nullable=False),
        sa.Column('source', sa.Text(), nullable=False),  # 'human', 'rule', 'import'
        sa.Column('created_at', sa.TIMESTAMP(), nullable=False, server_default=sa.text('NOW()')),
        sa.Column('updated_at', sa.TIMESTAMP(), nullable=False, server_default=sa.text('NOW()')),
        sa.PrimaryKeyConstraint('txn_id'),
        sa.ForeignKeyConstraint(['txn_id'], ['transactions.id'], ondelete='CASCADE'),
    )
    op.create_index('idx_transaction_labels_label', 'transaction_labels', ['label'])
    op.create_index('idx_transaction_labels_source', 'transaction_labels', ['source'])
    
    # 2) ML Features (point-in-time feature vectors)
    op.create_table(
        'ml_features',
        sa.Column('txn_id', sa.Integer(), nullable=False),
        sa.Column('ts_month', sa.Date(), nullable=False),  # yyyy-mm-01 for leakage-safe bucketing
        sa.Column('amount', sa.Numeric(), nullable=False),
        sa.Column('abs_amount', sa.Numeric(), nullable=False),
        sa.Column('merchant', sa.Text(), nullable=True),
        sa.Column('mcc', sa.Text(), nullable=True),
        sa.Column('channel', sa.Text(), nullable=True),  # 'pos','online','ach','zelle','deposit'
        sa.Column('hour_of_day', sa.SmallInteger(), nullable=True),
        sa.Column('dow', sa.SmallInteger(), nullable=True),  # day of week (0=Monday)
        sa.Column('is_weekend', sa.Boolean(), nullable=True),
        sa.Column('is_subscription', sa.Boolean(), nullable=True),
        sa.Column('norm_desc', sa.Text(), nullable=True),  # normalized description
        sa.Column('tokens', sa.ARRAY(sa.Text()), nullable=True),  # tokenized words
        sa.Column('created_at', sa.TIMESTAMP(), nullable=False, server_default=sa.text('NOW()')),
        sa.PrimaryKeyConstraint('txn_id'),
        sa.ForeignKeyConstraint(['txn_id'], ['transactions.id'], ondelete='CASCADE'),
    )
    op.create_index('idx_ml_features_ts_month', 'ml_features', ['ts_month'])
    op.create_index('idx_ml_features_merchant', 'ml_features', ['merchant'])
    
    # 3) Training outcomes (audit log)
    op.create_table(
        'ml_training_runs',
        sa.Column('run_id', sa.Text(), nullable=False),
        sa.Column('started_at', sa.TIMESTAMP(), nullable=False, server_default=sa.text('NOW()')),
        sa.Column('finished_at', sa.TIMESTAMP(), nullable=True),
        sa.Column('label_count', sa.Integer(), nullable=True),
        sa.Column('feature_count', sa.Integer(), nullable=True),
        sa.Column('val_f1_macro', sa.DOUBLE_PRECISION(), nullable=True),
        sa.Column('val_accuracy', sa.DOUBLE_PRECISION(), nullable=True),
        sa.Column('class_count', sa.Integer(), nullable=True),
        sa.Column('model_uri', sa.Text(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint('run_id'),
    )
    op.create_index('idx_ml_training_runs_started_at', 'ml_training_runs', ['started_at'])


def downgrade() -> None:
    """Downgrade schema - Remove ML training tables."""
    op.drop_table('ml_training_runs')
    op.drop_table('ml_features')
    op.drop_table('transaction_labels')
