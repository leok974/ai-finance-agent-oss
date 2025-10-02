"""merge heads help_cache + kms_ae_partial_idx

Revision ID: 20250927_merge_help_cache_heads
Revises: 2f3b1f326ce9, 20250927_add_help_cache
Create Date: 2025-09-27

This is a no-op merge migration to linearize history after adding help_cache table.
"""
from typing import Sequence, Union
from alembic import op  # noqa: F401
import sqlalchemy as sa  # noqa: F401

revision: str = '20250927_merge_help_cache_heads'
down_revision: Union[str, Sequence[str], None] = ('2f3b1f326ce9', '20250927_add_help_cache')
branch_labels = None
depends_on = None

def upgrade() -> None:  # pragma: no cover
    pass

def downgrade() -> None:  # pragma: no cover
    pass
