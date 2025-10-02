#!/usr/bin/env bash
set -e
# Try to upgrade to single head; if it fails (e.g., columns exist), continue
set +e
alembic -c /app/alembic.ini upgrade head || alembic -c /app/alembic.ini upgrade heads || echo "[start] Alembic upgrade skipped (non-fatal)"
set -e
exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers
