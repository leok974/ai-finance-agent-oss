"""add rule_suggestions table

Revision ID: 20250909_add_rule_suggestions
Revises: 20250908_merge_feedback_and_62bc5ef49a22
Create Date: 2025-09-09 10:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "20250909_add_rule_suggestions"
down_revision: Union[str, Sequence[str], None] = "20250908_merge_feedback_and_62bc5ef49a22"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema: create rule_suggestions table and indexes."""
    op.create_table(
        "rule_suggestions",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("merchant_norm", sa.String(length=255), nullable=False),
        sa.Column("category", sa.String(length=128), nullable=False),
        sa.Column("support_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("positive_rate", sa.Float(), nullable=False, server_default="0"),
        sa.Column("last_seen", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("cooldown_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ignored", sa.Boolean(), nullable=False, server_default="0"),
        sa.Column("applied_rule_id", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(["applied_rule_id"], ["rules.id"], name="fk_rule_suggestions_rule", use_alter=True, initially=None),
        sa.UniqueConstraint("merchant_norm", "category", name="ix_rule_suggestions_unique_pair"),
    )
    op.create_index(op.f("ix_rule_suggestions_merchant_norm"), "rule_suggestions", ["merchant_norm"], unique=False)
    op.create_index(op.f("ix_rule_suggestions_category"), "rule_suggestions", ["category"], unique=False)


def downgrade() -> None:
    """Downgrade schema: drop rule_suggestions table and indexes."""
    op.drop_index(op.f("ix_rule_suggestions_category"), table_name="rule_suggestions")
    op.drop_index(op.f("ix_rule_suggestions_merchant_norm"), table_name="rule_suggestions")
    op.drop_table("rule_suggestions")
