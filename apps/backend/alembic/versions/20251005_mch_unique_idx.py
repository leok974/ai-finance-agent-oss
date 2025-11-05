"""ensure unique index on merchant_category_hints (mc, slug)

Revision ID: 20251005_mch_unique_idx
Revises: 20251005_rag_pgvector
Create Date: 2025-10-05
"""

from alembic import op

# revision identifiers, used by Alembic.
revision = "20251005_mch_unique_idx"
down_revision = "20251005_rag_pgvector"
branch_labels = None
depends_on = None


def upgrade():
    op.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS uq_mch_mc_slug
        ON merchant_category_hints (merchant_canonical, category_slug);
        """
    )


def downgrade():
    op.execute("DROP INDEX IF EXISTS uq_mch_mc_slug;")
