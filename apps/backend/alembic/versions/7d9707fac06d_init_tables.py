"""init tables

Revision ID: 7d9707fac06d
Revises: 
Create Date: 2025-09-03 12:07:03.334556

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '7d9707fac06d'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Authoritative baseline: create core tables used by later migrations."""
    # transactions (minimal baseline; later migrations may alter/add indexes)
    op.create_table(
        "transactions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("merchant", sa.String(length=256), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("amount", sa.Float(), nullable=False),
        sa.Column("category", sa.String(length=128), nullable=True),
        sa.Column("raw_category", sa.String(length=128), nullable=True),
        sa.Column("account", sa.String(length=128), nullable=True),
        sa.Column("month", sa.String(length=7), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
        sa.UniqueConstraint("date", "amount", "description", name="uq_txn_dedup"),
    )

    # rules (baseline; later migrations add merchant/description/active/updated_at)
    op.create_table(
        "rules",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("merchant", sa.String(length=255), nullable=True),  # allow early compatibility
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("pattern", sa.String(length=256), nullable=True),
        sa.Column("target", sa.String(length=32), nullable=True),
        sa.Column("category", sa.String(length=128), nullable=True),
        sa.Column("active", sa.Boolean(), server_default="1", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
    )

    # user_labels
    op.create_table(
        "user_labels",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("txn_id", sa.Integer(), nullable=False),
        sa.Column("category", sa.String(length=128), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
    )


def downgrade() -> None:
    """Drop baseline tables in reverse order."""
    op.drop_table("user_labels")
    op.drop_table("rules")
    op.drop_table("transactions")
