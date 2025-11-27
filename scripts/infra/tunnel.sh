#!/usr/bin/env bash
set -euo pipefail
BASE="${1:-https://app.ledger-mind.org}"
FILES=(-f docker-compose.prod.yml -f docker-compose.prod.override.yml)

echo "== up: nginx backend cloudflared =="
docker compose "${FILES[@]}" up -d nginx backend cloudflared >/dev/null

echo "== cloudflared: tail (120) =="
docker compose "${FILES[@]}" logs --tail=120 cloudflared || true

echo "== edge checks =="
if curl -sfI "$BASE/ready" >/dev/null; then echo "✅ /ready ok"; else echo "❌ /ready"; fi
if curl -sfI "$BASE/api/healthz" >/dev/null; then echo "✅ /healthz ok"; else echo "❌ /healthz"; fi
