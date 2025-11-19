#!/usr/bin/env bash
set -euo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
COMMIT="$(git rev-parse --short=8 HEAD)"
BUILD_TIME="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

echo ">>> Deploying LedgerMind nginx"
echo "    branch = $BRANCH"
echo "    commit = $COMMIT"
echo "    build_time = $BUILD_TIME"
echo "    compose = $COMPOSE_FILE"
echo

# 1) Build nginx image
VITE_GIT_BRANCH="$BRANCH" \
VITE_GIT_COMMIT="$COMMIT" \
BUILD_TIME="$BUILD_TIME" \
docker compose -f "$COMPOSE_FILE" build --no-cache nginx

# 2) Recreate nginx container
docker compose -f "$COMPOSE_FILE" up -d --force-recreate nginx

# 3) Restart tunnels if present (best-effort)
if docker ps --format '{{.Names}}' | grep -q 'cfd-a'; then
  echo ">>> Restarting Cloudflare tunnels (cfd-a, cfd-b)..."
  docker restart cfd-a cfd-b || true
fi

echo
echo ">>> Done. Now run: scripts/check-ledgermind-prod-version.sh"
