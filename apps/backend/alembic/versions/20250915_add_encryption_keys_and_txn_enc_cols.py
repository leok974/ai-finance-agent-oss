"""add encryption_keys and txn encrypted columns

Revision ID: 20250915_add_encryption
Revises: ae14ab438627_merge_heads
Create Date: 2025-09-15
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '20250915_add_encryption'
down_revision = 'ae14ab438627'
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    dialect = bind.dialect.name

    # encryption_keys (idempotent)
    inspector = sa.inspect(bind)
    if 'encryption_keys' not in inspector.get_table_names():
        op.create_table(
            'encryption_keys',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('label', sa.String(length=32), nullable=False, index=True, unique=True),
            sa.Column('dek_wrapped', sa.LargeBinary(), nullable=False),
            sa.Column('dek_wrap_nonce', sa.LargeBinary(), nullable=False),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
        )
        try:
            op.create_index('ix_encryption_keys_label', 'encryption_keys', ['label'], unique=True)
        except Exception:
            pass

    # transactions encrypted columns (idempotent)
    existing_cols = {c['name'] for c in inspector.get_columns('transactions')}
    add_cols: list[tuple[str, sa.Column]] = [
        ('merchant_raw_enc', sa.Column('merchant_raw_enc', sa.LargeBinary(), nullable=True)),
        ('merchant_raw_nonce', sa.Column('merchant_raw_nonce', sa.LargeBinary(), nullable=True)),
        ('description_enc', sa.Column('description_enc', sa.LargeBinary(), nullable=True)),
        ('description_nonce', sa.Column('description_nonce', sa.LargeBinary(), nullable=True)),
        ('note_enc', sa.Column('note_enc', sa.LargeBinary(), nullable=True)),
        ('note_nonce', sa.Column('note_nonce', sa.LargeBinary(), nullable=True)),
        ('enc_label', sa.Column('enc_label', sa.String(length=32), nullable=True)),
    ]
    to_add = [(name, col) for name, col in add_cols if name not in existing_cols]
    if to_add:
        with op.batch_alter_table('transactions') as batch_op:
            for name, col in to_add:
                try:
                    batch_op.add_column(col)
                except Exception:
                    pass
    # index (idempotent)
    try:
        idx_names = {ix['name'] for ix in inspector.get_indexes('transactions')}
    except Exception:
        idx_names = set()
    if 'ix_transactions_enc_label' not in idx_names:
        try:
            op.create_index('ix_transactions_enc_label', 'transactions', ['enc_label'])
        except Exception:
            pass


def downgrade():
    with op.batch_alter_table('transactions') as batch_op:
        for c in ['merchant_raw_enc','merchant_raw_nonce','description_enc','description_nonce','note_enc','note_nonce','enc_label']:
            try:
                batch_op.drop_column(c)
            except Exception:
                pass
    try:
        op.drop_index('ix_transactions_enc_label', table_name='transactions')
    except Exception:
        pass
    try:
        op.drop_index('ix_encryption_keys_label', table_name='encryption_keys')
    except Exception:
        pass
    op.drop_table('encryption_keys')
