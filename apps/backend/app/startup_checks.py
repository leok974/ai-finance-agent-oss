"""Lightweight startup self-checks.

These run only on Postgres backends (skip for SQLite / tests) and are
best-effort: they log warnings rather than failing hard, to avoid
preventing application start in degraded environments.
"""

from __future__ import annotations

import logging

from sqlalchemy import text
from sqlalchemy.engine import Connection

from app.db import get_engine

log = logging.getLogger(__name__)


DESC_INDEX_NAME = "ix_transactions_date_desc"


def _is_postgres(conn: Connection) -> bool:
    return conn.dialect.name == "postgresql"


def check_single_head(conn: Connection) -> None:
    """Emits a warning if more than one Alembic head is detected.

    Detection is done via alembic_version history introspection; if the table
    is missing (fresh DB) we skip silently.
    """
    try:
        # Multi-head can only manifest if alembic_version has multiple rows after a merge mishap.
        rows = conn.execute(text("SELECT version_num FROM alembic_version"))  # type: ignore[arg-type]
        versions = [r[0] for r in rows]
        if len(versions) != 1:
            log.warning(
                "startup-check: expected 1 alembic head row, found %s: %s",
                len(versions),
                versions,
            )
    except Exception:  # table may not exist yet
        return


def check_transactions_date_index(conn: Connection) -> None:
    """Warn if the descending date index is missing (performance regression risk)."""
    try:
        res = conn.execute(
            text(
                "SELECT 1 FROM pg_indexes WHERE tablename='transactions' AND indexname=:n"
            ),
            {"n": DESC_INDEX_NAME},
        )
        found = res.first() is not None
        if not found:
            log.warning(
                "startup-check: index %s missing; latest_month query may degrade",
                DESC_INDEX_NAME,
            )
    except Exception:
        # Missing permissions or table; ignore
        pass


def run_all() -> None:
    engine = get_engine()
    with engine.connect() as conn:  # type: ignore[call-arg]
        if not _is_postgres(conn):  # skip for sqlite / tests
            return
        check_single_head(conn)
        check_transactions_date_index(conn)
