#!/bin/sh
# Quick edge probe loop with labeled endpoints
# Usage: ./scripts/edge-curl-loop.sh https://app.ledger-mind.org 3
BASE="${1:-https://app.ledger-mind.org}"
COUNT="${2:-3}"
ENDPOINTS="/_up /api/healthz /api/ready /api/live"
echo "Probing $BASE endpoints ($COUNT iterations)"
i=1
while [ $i -le $COUNT ]; do
  for p in $ENDPOINTS; do
    code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE$p")
    printf '[%d] %-12s -> %s\n' "$i" "$p" "$code"
  done
  i=$((i+1))
  sleep 1
done
echo "Done."
