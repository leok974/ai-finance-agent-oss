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
    """Create oauth_accounts table if it doesn't already exist.

    Some dev/test flows may have created this table out-of-band; guard with inspector.
    """
    bind = op.get_bind()
    dialect = bind.dialect.name
    insp = sa.inspect(bind)
    existing = insp.get_table_names() if dialect == "sqlite" else insp.get_table_names(schema="public")
    if "oauth_accounts" in existing:
        return

    op.create_table(
        "oauth_accounts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("provider", sa.String(length=32), nullable=False),
        sa.Column("provider_user_id", sa.String(length=255), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.UniqueConstraint("provider", "provider_user_id", name="uq_oauth_provider_user"),
    )


def downgrade() -> None:
    # Drop only if present to be symmetric with guarded upgrade
    bind = op.get_bind()
    dialect = bind.dialect.name
    insp = sa.inspect(bind)
    existing = insp.get_table_names() if dialect == "sqlite" else insp.get_table_names(schema="public")
    if "oauth_accounts" in existing:
        op.drop_table("oauth_accounts")
