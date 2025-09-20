"""Add KMS metadata columns and backfill from env

Revision ID: 20250916_add_kms_columns
Revises: 20250916_dek_wrap_nonce_nullable
Create Date: 2025-09-16
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import text
import os


revision = "20250916_add_kms_columns"
down_revision = "20250916_dek_wrap_nonce_nullable"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    cols = set()
    try:
        cols = {c['name'] for c in inspector.get_columns('encryption_keys')}
    except Exception:
        pass
    if 'wrap_scheme' not in cols:
        op.add_column("encryption_keys", sa.Column("wrap_scheme", sa.Text(), nullable=True))
    if 'kms_key_id' not in cols:
        op.add_column("encryption_keys", sa.Column("kms_key_id", sa.Text(), nullable=True))

    # Best-effort backfill for current active row
    kms_key = os.getenv("GCP_KMS_KEY")
    if kms_key:
        try:
            bind.execute(text(
                """
                UPDATE encryption_keys
                   SET wrap_scheme = COALESCE(wrap_scheme,'gcp_kms'),
                       kms_key_id  = COALESCE(kms_key_id,:k)
                 WHERE label='active'
                """
            ), {"k": kms_key})
        except Exception:
            pass


def downgrade():
    try:
        op.drop_column("encryption_keys", "kms_key_id")
    except Exception:
        pass
    try:
        op.drop_column("encryption_keys", "wrap_scheme")
    except Exception:
        pass
