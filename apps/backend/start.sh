#!/usr/bin/env bash
set -e
# Try to upgrade to single head; if multiple heads exist, upgrade all heads
alembic -c /app/alembic.ini upgrade head || alembic -c /app/alembic.ini upgrade heads
exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers
