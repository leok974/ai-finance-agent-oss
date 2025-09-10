"""add budgets table

Revision ID: 20250910_add_budgets_table
Revises: f520d83a6e85
Create Date: 2025-09-10 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "20250910_add_budgets_table"
down_revision: Union[str, Sequence[str], None] = "f520d83a6e85"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "budgets",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("category", sa.String, nullable=False),
        sa.Column("amount", sa.Float, nullable=False),
        sa.Column("effective_from", sa.Date, server_default=sa.text("CURRENT_DATE"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_budgets_category", "budgets", ["category"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_budgets_category", table_name="budgets")
    op.drop_table("budgets")
