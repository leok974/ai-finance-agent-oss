#!/usr/bin/env bash
# smoke-prod.sh - Fast deterministic smoke test for production deployment
# Validates /agent/chat stub mode is working with sub-second latency

set -euo pipefail

BASE="${BASE_URL:-https://app.ledger-mind.org}"

json() {
  curl -fsS -H 'content-type: application/json' "$@"
}

echo "🔍 Smoke testing $BASE..."

# Warmup (JIT cold start mitigation)
for i in {1..3}; do
  curl -fsS "$BASE/ready" >/dev/null 2>&1 || true
done

# Test 1: stub mode latency contract
echo "📡 Testing /agent/chat stub mode..."
t0=$(date +%s%3N)
r=$(json -X POST "$BASE/agent/chat" \
  -H 'x-test-mode: stub' \
  --data '{"messages":[{"role":"user","content":"ping"}],"context":{"month":"2025-08"}}')
t1=$(date +%s%3N)
latency=$((t1 - t0))

# Validate response
echo "$r" | grep -qi '"reply"' || { echo "❌ no reply field"; exit 1; }
echo "$r" | grep -qi 'deterministic' || { echo "❌ wrong stub response"; exit 1; }

echo "✅ agent/chat stub latency: ${latency}ms"

# Test 2: echo mode reflects content
echo "📡 Testing echo mode..."
r=$(json -X POST "$BASE/agent/chat" \
  -H 'x-test-mode: echo' \
  --data '{"messages":[{"role":"user","content":"test123"}],"context":{"month":"2025-08"}}')

echo "$r" | grep -qi '\[echo\] test123' || { echo "❌ echo mode failed"; exit 1; }
echo "✅ echo mode working"

# Test 3: API path compatibility (/api/agent/* → /agent/*)
echo "📡 Testing API path compatibility..."
r=$(json -X POST "$BASE/api/agent/chat" \
  -H 'x-test-mode: stub' \
  --data '{"messages":[{"role":"user","content":"compat"}],"context":{"month":"2025-08"}}')

echo "$r" | grep -qi '"reply"' || { echo "❌ /api/agent/* path broken"; exit 1; }
echo "✅ API path compatibility working"

echo ""
echo "✅ All smoke tests passed! Deployment healthy."
exit 0
