#!/usr/bin/env bash
set -euo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"

echo ">>> Expected nginx containers from $COMPOSE_FILE:"
docker compose -f "$COMPOSE_FILE" ps nginx || true
echo

echo ">>> All nginx-related containers:"
docker ps -a --filter "name=nginx" \
  --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}\t{{.Image}}"
echo

echo ">>> Removing orphans via docker compose --remove-orphans..."
docker compose -f "$COMPOSE_FILE" up -d --remove-orphans

echo
echo ">>> After cleanup:"
docker ps -a --filter "name=nginx" \
  --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}\t{{.Image}}"
