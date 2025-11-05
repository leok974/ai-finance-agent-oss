"""merge heads help_cache_merge + idx_txn_date

Revision ID: 20251002_merge_idx_and_help_cache_heads
Revises: 20250927_merge_help_cache_heads, 20251002_add_idx_txn_date
Create Date: 2025-10-02

No-op merge migration to linearize history after adding descending transactions.date index.
"""

from typing import Sequence, Union

# Alembic imports
from alembic import op  # noqa: F401
import sqlalchemy as sa  # noqa: F401

revision: str = "20251002_merge_idx_and_help_cache_heads"
down_revision: Union[str, Sequence[str], None] = (
    "20250927_merge_help_cache_heads",
    "20251002_add_idx_txn_date",
)
branch_labels = None
depends_on = None


def upgrade() -> None:  # pragma: no cover
    pass


def downgrade() -> None:  # pragma: no cover
    pass
