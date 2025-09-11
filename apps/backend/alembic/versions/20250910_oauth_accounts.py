"""oauth_accounts table

Revision ID: 20250910_oauth_accounts
Revises: 5349ed3102a4
Create Date: 2025-09-10

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "20250910_oauth_accounts"
down_revision: Union[str, Sequence[str], None] = "5349ed3102a4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "oauth_accounts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("provider", sa.String(length=32), nullable=False),
        sa.Column("provider_user_id", sa.String(length=255), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=True),
    )
    op.create_unique_constraint("uq_oauth_provider_user", "oauth_accounts", ["provider", "provider_user_id"])


def downgrade() -> None:
    op.drop_constraint("uq_oauth_provider_user", "oauth_accounts", type_="unique")
    op.drop_table("oauth_accounts")
