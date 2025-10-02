"""txns mgmt: soft-delete + split/merge/transfer

Revision ID: 20250913_txns_mgmt_soft_delete_split_transfer
Revises: 20250910_unify_rule_suggestions_one_table
Create Date: 2025-09-13
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

# ids
revision = "20250913_txns_mgmt_soft_delete_split_transfer"
down_revision = "20250910_unify_rule_suggestions_one_table"
branch_labels = None
depends_on = None

def upgrade():
    conn = op.get_bind()
    insp = inspect(conn)
    cols = {c["name"] for c in insp.get_columns("transactions")}

    if "deleted_at" not in cols:
        op.add_column("transactions", sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True))
    if "note" not in cols:
        op.add_column("transactions", sa.Column("note", sa.String(length=1024), nullable=True))
    if "split_parent_id" not in cols:
        op.add_column("transactions", sa.Column("split_parent_id", sa.Integer, nullable=True))
        op.create_index("ix_transactions_split_parent_id", "transactions", ["split_parent_id"], unique=False)
    if "transfer_group" not in cols:
        op.add_column("transactions", sa.Column("transfer_group", sa.String(length=36), nullable=True))
        op.create_index("ix_transactions_transfer_group", "transactions", ["transfer_group"], unique=False)

    # index on deleted_at for soft-delete scans
    idxs = {i["name"] for i in insp.get_indexes("transactions")}
    if "ix_txns_deleted_at" not in idxs:
        op.create_index("ix_txns_deleted_at", "transactions", ["deleted_at"], unique=False)


def downgrade():
    conn = op.get_bind()
    insp = inspect(conn)
    idxs = {i["name"] for i in insp.get_indexes("transactions")}
    if "ix_txns_deleted_at" in idxs:
        op.drop_index("ix_txns_deleted_at", table_name="transactions")
    if "ix_transactions_transfer_group" in idxs:
        op.drop_index("ix_transactions_transfer_group", table_name="transactions")
    if "ix_transactions_split_parent_id" in idxs:
        op.drop_index("ix_transactions_split_parent_id", table_name="transactions")

    cols = {c["name"] for c in inspect(conn).get_columns("transactions")}
    if "transfer_group" in cols:
        op.drop_column("transactions", "transfer_group")
    if "split_parent_id" in cols:
        op.drop_column("transactions", "split_parent_id")
    if "note" in cols:
        op.drop_column("transactions", "note")
    if "deleted_at" in cols:
        op.drop_column("transactions", "deleted_at")
