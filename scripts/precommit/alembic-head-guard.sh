#!/usr/bin/env bash
set -euo pipefail

INI="apps/backend/alembic.ini"
if [ ! -f "$INI" ]; then
  echo "(alembic head guard) skipping: $INI missing" >&2
  exit 0
fi

python scripts/alembic_guard.py || {
  echo "Multiple Alembic heads detected. Resolve before committing." >&2
  exit 1
}

exit 0
