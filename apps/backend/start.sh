#!/usr/bin/env bash
set -e
alembic -c /app/alembic.ini upgrade head
exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers
