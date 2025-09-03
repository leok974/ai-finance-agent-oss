#!/usr/bin/env bash
set -euo pipefail
MODEL=${1:-gpt-oss:20b}
REPO_DIR=$(cd "$(dirname "$0")/.." && pwd)

# 1) Ollama
if ! pgrep -x ollama >/dev/null; then
  echo "Starting ollama serve..."
  (ollama serve >/dev/null 2>&1 &)
  sleep 2
fi

echo "Pulling $MODEL (idempotent)..."
ollama pull "$MODEL"

# 2) Backend
pushd "$REPO_DIR/apps/backend" >/dev/null
export PYTHONNOUSERSITE=1
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000 &
BACK_PID=$!
popd >/dev/null

# 3) Frontend
pushd "$REPO_DIR/apps/web" >/dev/null
if command -v pnpm >/dev/null; then pnpm install; pnpm dev; else npm i -g pnpm && pnpm install && pnpm dev; fi
popd >/dev/null

trap "kill $BACK_PID 2>/dev/null || true" EXIT
