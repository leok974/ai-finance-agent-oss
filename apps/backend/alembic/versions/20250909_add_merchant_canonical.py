"""add transactions.merchant_canonical + backfill + index

NOTE: Backfill here uses a Python canonicalizer embedded in this migration to
mirror the app's behavior at the time of writing. If the app's
`app.utils.text.canonicalize_merchant` logic changes later, run the
`apps/backend/app/scripts/recanonicalize_merchants.py` script to recompute
stored canonicals, or write a follow-up migration.

Revision ID: 20250909_add_merchant_canonical
Revises: c4a739e0f055
Create Date: 2025-09-09 15:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.sql import text
import re

# revision identifiers, used by Alembic.
revision: str = "20250909_add_merchant_canonical"
down_revision: Union[str, Sequence[str], None] = "c4a739e0f055"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def _py_canonicalize(s: str | None) -> str | None:
    if not s:
        return None
    s = s.strip().lower()
    s = re.sub(r"\s+", " ", s)
    s = re.sub(r"[^\w\s]", " ", s)
    s = " ".join(s.split())
    return s or None


def _create_index_if_absent(conn, name: str, table: str, col: str):
    dialect = conn.engine.dialect.name
    if dialect == "postgresql":
        conn.execute(text(f"CREATE INDEX IF NOT EXISTS {name} ON {table} ({col})"))
    elif dialect == "sqlite":
        rows = conn.execute(text(f"PRAGMA index_list('{table}')")).fetchall()
        if not any(r[1] == name for r in rows):
            conn.execute(text(f"CREATE INDEX {name} ON {table} ({col})"))


def _drop_index_if_present(conn, name: str, table: str):
    dialect = conn.engine.dialect.name
    if dialect == "postgresql":
        conn.execute(text(f"DROP INDEX IF EXISTS {name}"))
    elif dialect == "sqlite":
        rows = conn.execute(text(f"PRAGMA index_list('{table}')")).fetchall()
        if any(r[1] == name for r in rows):
            conn.execute(text(f"DROP INDEX {name}"))


def upgrade() -> None:
    op.add_column("transactions", sa.Column("merchant_canonical", sa.String(length=256), nullable=True))

    conn = op.get_bind()
    dialect = conn.engine.dialect.name

    # Backfill canonicals; Python path prioritizes parity with app logic
    rows = conn.execute(text("SELECT id, merchant FROM transactions")).fetchall()
    for id_, merchant in rows:
        mc = _py_canonicalize(merchant)
        conn.execute(text("UPDATE transactions SET merchant_canonical = :mc WHERE id = :id"), {"mc": mc, "id": id_})

    # Create index (guard if exists)
    _create_index_if_absent(conn, "ix_transactions_merchant_canonical", "transactions", "merchant_canonical")


def downgrade() -> None:
    conn = op.get_bind()
    _drop_index_if_present(conn, "ix_transactions_merchant_canonical", "transactions")
    op.drop_column("transactions", "merchant_canonical")
