"""
Add index on transactions.enc_label to speed rotation/status queries.

Revision ID: 20250915_idx_enc_label
Revises: 20250915_add_encryption_keys_and_txn_enc_cols
Create Date: 2025-09-15
"""

from alembic import op


revision = "20250915_idx_enc_label"
down_revision = "20250915_add_encryption_keys_and_txn_enc_cols"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_transactions_enc_label ON transactions (enc_label)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_transactions_enc_label")
