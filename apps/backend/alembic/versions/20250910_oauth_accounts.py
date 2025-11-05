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
    bind = op.get_bind()
    dialect = bind.dialect.name
    insp = sa.inspect(bind)

    table_exists = insp.has_table("oauth_accounts")

    if dialect == "sqlite":
        # SQLite: either create table with inline UniqueConstraint or add a unique index if table already exists
        if not table_exists:
            op.create_table(
                "oauth_accounts",
                sa.Column("id", sa.Integer(), primary_key=True),
                sa.Column(
                    "user_id",
                    sa.Integer(),
                    sa.ForeignKey("users.id", ondelete="CASCADE"),
                    nullable=False,
                ),
                sa.Column("provider", sa.String(length=32), nullable=False),
                sa.Column("provider_user_id", sa.String(length=255), nullable=False),
                sa.Column("email", sa.String(length=255), nullable=True),
                sa.UniqueConstraint(
                    "provider", "provider_user_id", name="uq_oauth_provider_user"
                ),
            )
        else:
            idx_names = {ix.get("name") for ix in insp.get_indexes("oauth_accounts")}
            if "uq_oauth_provider_user" not in idx_names:
                op.create_index(
                    "uq_oauth_provider_user",
                    "oauth_accounts",
                    ["provider", "provider_user_id"],
                    unique=True,
                )
    else:
        if not table_exists:
            op.create_table(
                "oauth_accounts",
                sa.Column("id", sa.Integer(), primary_key=True),
                sa.Column(
                    "user_id",
                    sa.Integer(),
                    sa.ForeignKey("users.id", ondelete="CASCADE"),
                    nullable=False,
                ),
                sa.Column("provider", sa.String(length=32), nullable=False),
                sa.Column("provider_user_id", sa.String(length=255), nullable=False),
                sa.Column("email", sa.String(length=255), nullable=True),
            )
        # Add the named unique constraint in dialects that support ALTER ADD CONSTRAINT
        # Safe if it already exists in some DBs, but typically Alembic sequence ensures this runs once.
        op.create_unique_constraint(
            "uq_oauth_provider_user", "oauth_accounts", ["provider", "provider_user_id"]
        )


def downgrade() -> None:
    bind = op.get_bind()
    dialect = bind.dialect.name
    insp = sa.inspect(bind)

    if dialect == "sqlite":
        # Drop unique index if present, then drop table
        idx_names = (
            {ix.get("name") for ix in insp.get_indexes("oauth_accounts")}
            if insp.has_table("oauth_accounts")
            else set()
        )
        if "uq_oauth_provider_user" in idx_names:
            op.drop_index("uq_oauth_provider_user", table_name="oauth_accounts")
        if insp.has_table("oauth_accounts"):
            op.drop_table("oauth_accounts")
    else:
        op.drop_constraint("uq_oauth_provider_user", "oauth_accounts", type_="unique")
        op.drop_table("oauth_accounts")
