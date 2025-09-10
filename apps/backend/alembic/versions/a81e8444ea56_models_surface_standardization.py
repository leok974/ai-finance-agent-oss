"""models surface standardization

Revision ID: a81e8444ea56
Revises: f520d83a6e85
Create Date: 2025-09-09 17:41:43.710715

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a81e8444ea56'
down_revision: Union[str, Sequence[str], None] = 'f520d83a6e85'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
       """Upgrade schema (guarded for existing tables/indexes)."""
       conn = op.get_bind()
       inspector = sa.inspect(conn)
       existing_tables = set(inspector.get_table_names())

       if 'feedback' not in existing_tables:
              op.create_table('feedback',
              sa.Column('id', sa.Integer(), nullable=False),
              sa.Column('txn_id', sa.Integer(), nullable=False),
              sa.Column('label', sa.String(length=128), nullable=False),
              sa.Column('source', sa.String(length=64), server_default='user_change', nullable=False),
              sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
              sa.Column('notes', sa.Text(), nullable=True),
              sa.ForeignKeyConstraint(['txn_id'], ['transactions.id'], ),
              sa.PrimaryKeyConstraint('id')
              )
       with op.batch_alter_table('feedback', schema=None) as batch_op:
              existing_feedback_indexes = {ix['name'] for ix in inspector.get_indexes('feedback')}
              if batch_op.f('ix_feedback_id') not in existing_feedback_indexes:
                     batch_op.create_index(batch_op.f('ix_feedback_id'), ['id'], unique=False)
              if batch_op.f('ix_feedback_txn_id') not in existing_feedback_indexes:
                     batch_op.create_index(batch_op.f('ix_feedback_txn_id'), ['txn_id'], unique=False)

       if 'rule_suggestions' not in existing_tables:
              op.create_table('rule_suggestions',
              sa.Column('id', sa.Integer(), nullable=False),
              sa.Column('merchant_norm', sa.String(length=255), nullable=False),
              sa.Column('category', sa.String(length=128), nullable=False),
              sa.Column('support_count', sa.Integer(), server_default='0', nullable=False),
              sa.Column('positive_rate', sa.Float(), server_default='0', nullable=False),
              sa.Column('last_seen', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
              sa.Column('cooldown_until', sa.DateTime(timezone=True), nullable=True),
              sa.Column('ignored', sa.Boolean(), server_default='0', nullable=False),
              sa.Column('applied_rule_id', sa.Integer(), nullable=True),
              sa.ForeignKeyConstraint(['applied_rule_id'], ['rules.id'], ),
              sa.PrimaryKeyConstraint('id')
              )
       with op.batch_alter_table('rule_suggestions', schema=None) as batch_op:
              existing_rs_indexes = {ix['name'] for ix in inspector.get_indexes('rule_suggestions')}
              if batch_op.f('ix_rule_suggestions_category') not in existing_rs_indexes:
                     batch_op.create_index(batch_op.f('ix_rule_suggestions_category'), ['category'], unique=False)
              if batch_op.f('ix_rule_suggestions_id') not in existing_rs_indexes:
                     batch_op.create_index(batch_op.f('ix_rule_suggestions_id'), ['id'], unique=False)
              if batch_op.f('ix_rule_suggestions_merchant_norm') not in existing_rs_indexes:
                     batch_op.create_index(batch_op.f('ix_rule_suggestions_merchant_norm'), ['merchant_norm'], unique=False)
              if 'ix_rule_suggestions_unique_pair' not in existing_rs_indexes:
                     batch_op.create_index('ix_rule_suggestions_unique_pair', ['merchant_norm', 'category'], unique=True)

       with op.batch_alter_table('recurring_series', schema=None) as batch_op:
              batch_op.alter_column('created_at',
                        existing_type=sa.DATETIME(),
                        server_default=sa.text('(CURRENT_TIMESTAMP)'),
                        existing_nullable=False)

       # Rules alters + guard index creation if already exists
       existing_rules_indexes = {ix['name'] for ix in inspector.get_indexes('rules')}
       with op.batch_alter_table('rules', schema=None) as batch_op:
              if 'merchant' not in {c['name'] for c in inspector.get_columns('rules')}:
                     batch_op.add_column(sa.Column('merchant', sa.String(length=255), nullable=True))
              if 'description' not in {c['name'] for c in inspector.get_columns('rules')}:
                     batch_op.add_column(sa.Column('description', sa.Text(), nullable=True))
              if 'active' not in {c['name'] for c in inspector.get_columns('rules')}:
                     batch_op.add_column(sa.Column('active', sa.Boolean(), server_default='1', nullable=False))
              if 'updated_at' not in {c['name'] for c in inspector.get_columns('rules')}:
                     batch_op.add_column(sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False))
              # relax types/nullability if present
              if 'pattern' in {c['name'] for c in inspector.get_columns('rules')}:
                     batch_op.alter_column('pattern', existing_type=sa.VARCHAR(length=256), type_=sa.String(length=255), existing_nullable=True)
              if 'target' in {c['name'] for c in inspector.get_columns('rules')}:
                     batch_op.alter_column('target', existing_type=sa.VARCHAR(length=32), nullable=True)
              if 'category' in {c['name'] for c in inspector.get_columns('rules')}:
                     batch_op.alter_column('category', existing_type=sa.VARCHAR(length=128), nullable=False)
              batch_op.alter_column('created_at', existing_type=sa.DATETIME(), nullable=False, existing_server_default=sa.text('(CURRENT_TIMESTAMP)'))
              if batch_op.f('ix_rules_merchant') not in existing_rules_indexes:
                     batch_op.create_index(batch_op.f('ix_rules_merchant'), ['merchant'], unique=False)

       with op.batch_alter_table('transaction_splits', schema=None) as batch_op:
              batch_op.alter_column('created_at',
                        existing_type=sa.DATETIME(),
                        server_default=sa.text('(CURRENT_TIMESTAMP)'),
                        existing_nullable=False)

       # guard transactions index
       existing_tx_indexes = {ix['name'] for ix in inspector.get_indexes('transactions')}
       with op.batch_alter_table('transactions', schema=None) as batch_op:
              batch_op.alter_column('created_at',
                        existing_type=sa.DATETIME(),
                        nullable=False,
                        existing_server_default=sa.text('(CURRENT_TIMESTAMP)'))
              batch_op.alter_column('updated_at',
                        existing_type=sa.DATETIME(),
                        nullable=False,
                        existing_server_default=sa.text('(CURRENT_TIMESTAMP)'))
              if batch_op.f('ix_transactions_id') not in existing_tx_indexes:
                     batch_op.create_index(batch_op.f('ix_transactions_id'), ['id'], unique=False)

       with op.batch_alter_table('transfer_links', schema=None) as batch_op:
              batch_op.alter_column('created_at',
                        existing_type=sa.DATETIME(),
                        server_default=sa.text('(CURRENT_TIMESTAMP)'),
                        existing_nullable=False)

       with op.batch_alter_table('user_labels', schema=None) as batch_op:
              batch_op.alter_column('txn_id',
                        existing_type=sa.INTEGER(),
                        nullable=False)
              batch_op.alter_column('category',
                        existing_type=sa.VARCHAR(length=128),
                        nullable=False)
              batch_op.alter_column('created_at',
                        existing_type=sa.DATETIME(),
                        nullable=False,
                        existing_server_default=sa.text('(CURRENT_TIMESTAMP)'))

       # ### end Alembic commands ###


def downgrade() -> None:
    """Downgrade schema."""
    # ### commands auto generated by Alembic - please adjust! ###
    with op.batch_alter_table('user_labels', schema=None) as batch_op:
        batch_op.alter_column('created_at',
               existing_type=sa.DATETIME(),
               nullable=True,
               existing_server_default=sa.text('(CURRENT_TIMESTAMP)'))
        batch_op.alter_column('category',
               existing_type=sa.VARCHAR(length=128),
               nullable=True)
        batch_op.alter_column('txn_id',
               existing_type=sa.INTEGER(),
               nullable=True)

    with op.batch_alter_table('transfer_links', schema=None) as batch_op:
        batch_op.alter_column('created_at',
               existing_type=sa.DATETIME(),
               server_default=sa.text('(now())'),
               existing_nullable=False)

    with op.batch_alter_table('transactions', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_transactions_id'))
        batch_op.alter_column('updated_at',
               existing_type=sa.DATETIME(),
               nullable=True,
               existing_server_default=sa.text('(CURRENT_TIMESTAMP)'))
        batch_op.alter_column('created_at',
               existing_type=sa.DATETIME(),
               nullable=True,
               existing_server_default=sa.text('(CURRENT_TIMESTAMP)'))

    with op.batch_alter_table('transaction_splits', schema=None) as batch_op:
        batch_op.alter_column('created_at',
               existing_type=sa.DATETIME(),
               server_default=sa.text('(now())'),
               existing_nullable=False)

    with op.batch_alter_table('rules', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_rules_merchant'))
        batch_op.alter_column('created_at',
               existing_type=sa.DATETIME(),
               nullable=True,
               existing_server_default=sa.text('(CURRENT_TIMESTAMP)'))
        batch_op.alter_column('category',
               existing_type=sa.VARCHAR(length=128),
               nullable=True)
        batch_op.alter_column('target',
               existing_type=sa.VARCHAR(length=32),
               nullable=False)
        batch_op.alter_column('pattern',
               existing_type=sa.String(length=255),
               type_=sa.VARCHAR(length=256),
               existing_nullable=True)
        batch_op.drop_column('updated_at')
        batch_op.drop_column('active')
        batch_op.drop_column('description')
        batch_op.drop_column('merchant')

    with op.batch_alter_table('recurring_series', schema=None) as batch_op:
        batch_op.alter_column('created_at',
               existing_type=sa.DATETIME(),
               server_default=sa.text('(now())'),
               existing_nullable=False)

    with op.batch_alter_table('rule_suggestions', schema=None) as batch_op:
        batch_op.drop_index('ix_rule_suggestions_unique_pair')
        batch_op.drop_index(batch_op.f('ix_rule_suggestions_merchant_norm'))
        batch_op.drop_index(batch_op.f('ix_rule_suggestions_id'))
        batch_op.drop_index(batch_op.f('ix_rule_suggestions_category'))

    op.drop_table('rule_suggestions')
    with op.batch_alter_table('feedback', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_feedback_txn_id'))
        batch_op.drop_index(batch_op.f('ix_feedback_id'))

    op.drop_table('feedback')
    # ### end Alembic commands ###
