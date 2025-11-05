"""categorize suggest tables + indexes

Revision ID: 20251004_categorize_suggest
Revises: 20251004_add_password_reset_tokens
Create Date: 2025-10-04

"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "20251004_categorize_suggest"
down_revision = "20251004_add_password_reset_tokens"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "categories",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("slug", sa.String(64), nullable=False, unique=True, index=True),
        sa.Column("label", sa.String(128), nullable=False),
        sa.Column("parent_slug", sa.String(64), nullable=True),
    )

    op.create_table(
        "merchant_category_hints",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("merchant_canonical", sa.String(128), nullable=False, index=True),
        sa.Column("category_slug", sa.String(64), nullable=False),
        sa.Column("source", sa.String(16), nullable=False),  # rule|pattern|ml|user
        sa.Column("confidence", sa.Float, nullable=False, server_default="0.5"),
        sa.Column(
            "updated_at",
            sa.DateTime,
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
    )
    op.create_index(
        "ix_mch_unique",
        "merchant_category_hints",
        ["merchant_canonical", "category_slug"],
        unique=True,
    )

    op.create_table(
        "category_rules",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("pattern", sa.String(256), nullable=False),  # REGEX or ILIKE
        sa.Column("category_slug", sa.String(64), nullable=False),
        sa.Column("priority", sa.Integer, nullable=False, server_default="100"),
        sa.Column(
            "enabled", sa.Boolean, nullable=False, server_default=sa.text("true")
        ),
        sa.Column(
            "updated_at",
            sa.DateTime,
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
    )

    # Ensure transactions columns & indexes exist (safe if already present)
    # Check if columns exist before adding
    from sqlalchemy import inspect

    conn = op.get_bind()
    inspector = inspect(conn)
    existing_columns = {col["name"] for col in inspector.get_columns("transactions")}

    if "merchant_canonical" not in existing_columns:
        op.add_column(
            "transactions",
            sa.Column("merchant_canonical", sa.String(128), nullable=True),
        )
    if "category_slug" not in existing_columns:
        op.add_column(
            "transactions", sa.Column("category_slug", sa.String(64), nullable=True)
        )

    # Check if indexes exist before creating
    existing_indexes = {idx["name"] for idx in inspector.get_indexes("transactions")}
    if "ix_transactions_merchant_canonical" not in existing_indexes:
        op.create_index(
            "ix_transactions_merchant_canonical",
            "transactions",
            ["merchant_canonical"],
            unique=False,
        )
    if "ix_transactions_category_slug" not in existing_indexes:
        op.create_index(
            "ix_transactions_category_slug",
            "transactions",
            ["category_slug"],
            unique=False,
        )


def downgrade():
    op.drop_index("ix_transactions_category_slug", table_name="transactions")
    op.drop_index("ix_transactions_merchant_canonical", table_name="transactions")
    op.drop_table("category_rules")
    op.drop_index("ix_mch_unique", table_name="merchant_category_hints")
    op.drop_table("merchant_category_hints")
    op.drop_table("categories")
