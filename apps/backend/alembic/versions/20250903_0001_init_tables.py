"""init tables

Revision ID: 20250903_0001
Revises:
Create Date: 2025-09-03
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "20250903_0001"
down_revision = None
branch_labels = None
depends_on = None

def upgrade() -> None:
    op.create_table(
        "transactions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("merchant", sa.String(length=256)),
        sa.Column("description", sa.Text()),
        sa.Column("amount", sa.Float(), nullable=False),
        sa.Column("category", sa.String(length=128)),
        sa.Column("raw_category", sa.String(length=128)),
        sa.Column("account", sa.String(length=128)),
        sa.Column("month", sa.String(length=7), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    sa.UniqueConstraint("date", "amount", "description", name="uq_txn_dedup"),
    )
    op.create_index("ix_transactions_date", "transactions", ["date"])
    op.create_index("ix_transactions_merchant", "transactions", ["merchant"])
    op.create_index("ix_transactions_category", "transactions", ["category"])
    op.create_index("ix_transactions_account", "transactions", ["account"])
    op.create_index("ix_transactions_month", "transactions", ["month"])
    # uq_txn_dedup declared inside transactions create_table above

    op.create_table(
        "rules",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("pattern", sa.String(length=256)),
        sa.Column("target", sa.String(length=32), nullable=False),
        sa.Column("category", sa.String(length=128)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_rules_pattern", "rules", ["pattern"])
    op.create_index("ix_rules_category", "rules", ["category"])

    op.create_table(
        "user_labels",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("txn_id", sa.Integer()),
        sa.Column("category", sa.String(length=128)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_user_labels_txn_id", "user_labels", ["txn_id"])
    op.create_index("ix_user_labels_category", "user_labels", ["category"])


def downgrade() -> None:
    op.drop_index("ix_user_labels_category", table_name="user_labels")
    op.drop_index("ix_user_labels_txn_id", table_name="user_labels")
    op.drop_table("user_labels")

    op.drop_index("ix_rules_category", table_name="rules")
    op.drop_index("ix_rules_pattern", table_name="rules")
    op.drop_table("rules")

    op.drop_constraint("uq_txn_dedup", "transactions", type_="unique")
    op.drop_index("ix_transactions_month", table_name="transactions")
    op.drop_index("ix_transactions_account", table_name="transactions")
    op.drop_index("ix_transactions_category", table_name="transactions")
    op.drop_index("ix_transactions_merchant", table_name="transactions")
    op.drop_index("ix_transactions_date", table_name="transactions")
    op.drop_table("transactions")
