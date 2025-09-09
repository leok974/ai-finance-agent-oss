"""feedback.created_at not null default now + indexes

Revision ID: 20250909_feedback_created_at_not_null
Revises: 20250909_add_rule_suggestions
Create Date: 2025-09-09 12:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.sql import text


# revision identifiers, used by Alembic.
revision: str = "20250909_feedback_created_at_not_null"
down_revision: Union[str, Sequence[str], None] = "20250909_add_rule_suggestions"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()

    # 1) Backfill NULLs to current timestamp
    conn.execute(text("UPDATE feedback SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL"))

    # 2) Enforce NOT NULL + default
    dialect = conn.engine.dialect.name
    default_expr = sa.text("CURRENT_TIMESTAMP") if dialect == "sqlite" else sa.text("now()")
    op.alter_column(
        "feedback",
        "created_at",
        existing_type=sa.DateTime(timezone=True),
        nullable=False,
        server_default=default_expr,
    )

    # 3) Helpful indexes
    with op.batch_alter_table("feedback", schema=None) as b:
        b.create_index("ix_feedback_created_at", ["created_at"], unique=False)
    with op.batch_alter_table("transactions", schema=None) as b:
        b.create_index("ix_transactions_date", ["date"], unique=False)


def downgrade() -> None:
    # Drop indexes
    with op.batch_alter_table("feedback", schema=None) as b:
        try:
            b.drop_index("ix_feedback_created_at")
        except Exception:
            pass
    with op.batch_alter_table("transactions", schema=None) as b:
        try:
            b.drop_index("ix_transactions_date")
        except Exception:
            pass

    # Revert NOT NULL/default
    op.alter_column(
        "feedback",
        "created_at",
        existing_type=sa.DateTime(timezone=True),
        nullable=True,
        server_default=None,
    )
