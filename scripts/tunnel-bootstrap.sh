#!/usr/bin/env bash
set -euo pipefail

CFG="cloudflared/config.yml"
DIR="cloudflared"
mkdir -p "$DIR"

# Find a single credentials JSON
CRED=$(ls -1 "$DIR"/*.json 2>/dev/null | head -n1 || true)
if [[ -z "${CRED}" ]]; then
  echo "❌ No credentials JSON found under $DIR. Copy ~/.cloudflared/<UUID>.json -> $DIR/" >&2
  exit 1
fi

UUID=$(basename "$CRED" .json)
echo "Found credentials: $CRED (UUID=$UUID)"

cat > "$CFG" <<YAML
tunnel: ${UUID}
credentials-file: ${DIR}/${UUID}.json
ingress:
  - hostname: app.ledger-mind.org
    service: http://nginx:80
  - service: http_status:404
YAML

echo "✅ Wrote $CFG"
