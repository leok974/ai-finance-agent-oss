"""Alembic heads guard.

Fails (exit 1) if there is not exactly one Alembic head revision.
Pure graph inspection – does not touch the database.

Usage:
  ALEMBIC_INI=apps/backend/alembic.ini python scripts/alembic_guard.py
"""

from __future__ import annotations

import os
import sys
from alembic.config import Config
from alembic.script import ScriptDirectory


def main() -> int:
    ini_path = os.environ.get("ALEMBIC_INI", "apps/backend/alembic.ini")
    if not os.path.exists(ini_path):
        print(f"ERROR: Alembic ini not found: {ini_path}", file=sys.stderr)
        return 2

    cfg = Config(ini_path)
    # We do not need DB connectivity; ScriptDirectory only reads versions dir.
    script = ScriptDirectory.from_config(cfg)
    revisions = list(script.get_revisions("heads"))
    printable = [f"{rev.revision} :: {rev.doc}" for rev in revisions]
    print("Heads:", printable)
    if len(revisions) != 1:
        print(
            f"ERROR: Expected exactly 1 head, found {len(revisions)}.", file=sys.stderr
        )
        return 1
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
