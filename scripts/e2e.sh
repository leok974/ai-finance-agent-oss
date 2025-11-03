#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

GREP=${1:-}              # optional grep string
BASELINE=${BASELINE:-0}  # set BASELINE=1 to update snapshots
DOWN=${DOWN:-0}

export DATABASE_URL="${DATABASE_URL:-postgresql+psycopg://app:app@127.0.0.1:5432/app_e2e}"
export APP_ENV=dev
export ALLOW_DEV_ROUTES=1
export DEV_SUPERUSER_EMAIL="${DEV_SUPERUSER_EMAIL:-leoklemet.pa@gmail.com}"
export DEV_SUPERUSER_PIN="${DEV_SUPERUSER_PIN:-946281}"
export DEV_E2E_EMAIL="${DEV_E2E_EMAIL:-leoklemet.pa@gmail.com}"
export DEV_E2E_PASSWORD="${DEV_E2E_PASSWORD:-Superleo3}"

echo "🗄️  Starting Postgres (docker compose)..."
docker compose -f docker-compose.e2e.yml up -d db

echo "⏳ Waiting for Postgres to be healthy..."
for i in {1..60}; do
  if docker compose -f docker-compose.e2e.yml exec -T db pg_isready -U app -d app_e2e >/dev/null 2>&1; then
    echo "✅ Postgres is healthy"
    break
  fi
  sleep 2
done

echo "🧱 Migrating + resetting + seeding..."
pushd apps/backend >/dev/null
echo "  📦 Installing backend dependencies..."
python -m pip install -r requirements.txt -q

echo "  🔄 Running migrations..."
python -m alembic upgrade head

echo "  🗑️  Resetting database..."
python scripts/e2e_db_reset.py

echo "  🌱 Seeding test user..."
python -m app.cli_seed_dev_user "${DEV_E2E_EMAIL}" "${DEV_E2E_PASSWORD}"
popd >/dev/null
echo "✅ Backend setup complete"

echo "📦 Installing web deps + browsers..."
pushd apps/web >/dev/null
pnpm i
pnpm exec playwright install --with-deps chromium

RUN_ARGS=()
[[ -n "$GREP" ]] && RUN_ARGS+=(-g "$GREP") && echo "🔍 Running tests matching: $GREP"
[[ "$BASELINE" == "1" ]] && RUN_ARGS+=(--update-snapshots) && echo "📸 Updating snapshots (baseline mode)"

echo "🎭 Running Playwright E2E tests..."
pnpm exec playwright test "${RUN_ARGS[@]}"
CODE=$?
popd >/dev/null

if [[ "$DOWN" == "1" ]]; then
  echo "🧹 Bringing down docker compose..."
  docker compose -f docker-compose.e2e.yml down -v
fi

if [[ "$CODE" != "0" ]]; then
  echo "❌ E2E tests failed"
  exit $CODE
fi

echo "✅ E2E tests completed successfully!"
exit 0
