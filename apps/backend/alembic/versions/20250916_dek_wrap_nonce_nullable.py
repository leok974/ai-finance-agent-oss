"""Make dek_wrap_nonce nullable for KMS scheme

Revision ID: 20250916_dek_wrap_nonce_nullable
Revises: 20250915_add_encryption
Create Date: 2025-09-16
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '20250916_dek_wrap_nonce_nullable'
down_revision = '20250915_add_encryption'
branch_labels = None
depends_on = None

def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    # Only alter if table/column exists
    if 'encryption_keys' in inspector.get_table_names():
        cols = {c['name'] for c in inspector.get_columns('encryption_keys')}
        if 'dek_wrap_nonce' in cols:
            with op.batch_alter_table('encryption_keys') as batch_op:
                try:
                    batch_op.alter_column('dek_wrap_nonce', existing_type=sa.LargeBinary(), nullable=True)
                except Exception:
                    pass


def downgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if 'encryption_keys' in inspector.get_table_names():
        cols = {c['name'] for c in inspector.get_columns('encryption_keys')}
        if 'dek_wrap_nonce' in cols:
            with op.batch_alter_table('encryption_keys') as batch_op:
                try:
                    batch_op.alter_column('dek_wrap_nonce', existing_type=sa.LargeBinary(), nullable=False)
                except Exception:
                    pass
