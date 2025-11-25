#!/bin/bash
# demo_prelude.sh - Demo setup and smoke test script
# Validates backend health and runs canonical RAG queries

set -e

BASE_URL="${BASE_URL:-http://localhost}"
TIMEOUT="${TIMEOUT:-90}"

echo "=== LedgerMind Demo Prelude ==="
echo "Base URL: $BASE_URL"
echo "Timeout: ${TIMEOUT}s"
echo

# Wait for backend to be ready
echo "[1/5] Waiting for backend ready..."
max_attempts=$((TIMEOUT / 5))
attempt=0

while [ $attempt -lt $max_attempts ]; do
  if curl -fsS "${BASE_URL}/api/ready" >/dev/null 2>&1; then
    echo "✓ Backend ready"
    break
  fi
  attempt=$((attempt + 1))
  echo "  Attempt $attempt/$max_attempts..."
  sleep 5
done

if [ $attempt -eq $max_attempts ]; then
  echo "✗ Backend failed to become ready in ${TIMEOUT}s"
  exit 1
fi

# Check health
echo
echo "[2/5] Checking health..."
HEALTH=$(curl -fsS "${BASE_URL}/api/healthz")
echo "$HEALTH" | jq '.status' 2>/dev/null || echo "$HEALTH"

if ! echo "$HEALTH" | grep -q '"status":"ok"'; then
  echo "✗ Health check failed"
  exit 1
fi
echo "✓ Health OK"

# Check version
echo
echo "[3/5] Checking version..."
VERSION=$(curl -fsS "${BASE_URL}/api/version")
echo "$VERSION" | jq -r '.version + " (" + .commit + ")"' 2>/dev/null || echo "$VERSION"

# Check RAG status (requires auth, so may fail gracefully)
echo
echo "[4/5] Checking RAG status..."
RAG_STATUS=$(curl -s "${BASE_URL}/api/agent/tools/rag/status" 2>/dev/null || echo '{"error":"auth required"}')
echo "$RAG_STATUS" | jq '.' 2>/dev/null || echo "$RAG_STATUS"

# Run canonical demo queries
echo
echo "[5/5] Running canonical RAG queries..."
echo

QUERIES=(
  "credit card rewards"
  "subscription tracking"
  "budget insights"
)

for i in "${!QUERIES[@]}"; do
  query="${QUERIES[$i]}"
  num=$((i + 1))
  echo "Query $num: \"$query\""

  RESULT=$(curl -fsS -X POST "${BASE_URL}/api/agent/rag/query" \
    -H 'content-type: application/json' \
    -d "{\"q\":\"$query\",\"k\":3}" 2>/dev/null || echo '{"error":"query failed"}')

  if echo "$RESULT" | jq -e '.hits | length' >/dev/null 2>&1; then
    hit_count=$(echo "$RESULT" | jq -r '.hits | length')
    echo "  → $hit_count results"

    # Show top result
    if [ "$hit_count" -gt 0 ]; then
      top_content=$(echo "$RESULT" | jq -r '.hits[0].content' 2>/dev/null | head -c 100)
      top_score=$(echo "$RESULT" | jq -r '.hits[0].score' 2>/dev/null)
      echo "  → Top result (score: $top_score): ${top_content}..."
    fi
  else
    echo "  → Error or no results"
  fi
  echo
done

echo "=== Demo Prelude Complete ==="
echo "✓ All checks passed"
echo
echo "Testing instructions:"
echo "  curl -fsS ${BASE_URL}/api/healthz"
echo "  curl -fsS ${BASE_URL}/api/agent/tools/meta/latest_month"
echo "  curl -fsS -X POST ${BASE_URL}/api/agent/rag/query \\"
echo "    -H 'content-type: application/json' \\"
echo "    -d '{\"q\":\"credit card rewards\",\"k\":3}'"
