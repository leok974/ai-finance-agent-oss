"""merge heads kms+ae_partial_idx

Revision ID: 2f3b1f326ce9
Revises: 20250916_add_kms_columns, 20250925_ae_partial_idx_fallback
Create Date: 2025-09-26 19:23:24.049438

"""

from typing import Sequence, Union


# revision identifiers, used by Alembic.
revision: str = "2f3b1f326ce9"
down_revision: Union[str, Sequence[str], None] = (
    "20250916_add_kms_columns",
    "20250925_ae_partial_idx_fallback",
)
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
