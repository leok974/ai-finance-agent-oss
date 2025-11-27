#!/usr/bin/env bash
# LLM Health Check - Warm up and verify LLM availability
# Usage: ./scripts/llm-health.sh
# Exits 0 if LLM healthy, 1 otherwise

set -euo pipefail

BASE="${BASE_URL:-https://app.ledger-mind.org}"

echo "🔍 Checking LLM health at $BASE..."

# Check /agent/status endpoint
echo "📡 Fetching /agent/status..."
status=$(curl -fsS "$BASE/agent/status" || { echo "❌ Status endpoint unreachable"; exit 1; })

# Parse llm_ok field
llm_ok=$(echo "$status" | jq -r '.llm_ok' 2>/dev/null || echo "false")

if [[ "$llm_ok" != "true" ]]; then
  echo "❌ LLM not ready (llm_ok: $llm_ok)"
  echo "   Full status: $status"
  exit 1
fi

echo "✅ LLM status: OK"

# Warmup: Send 2 requests to prime model and caches
echo "🔥 Warming up LLM (2 requests)..."
for i in 1 2; do
  curl -fsS -H 'content-type: application/json' \
    -H 'x-test-mode: stub' \
    -d '{"messages":[{"role":"user","content":"warmup"}],"force_llm":false}' \
    "$BASE/agent/chat" >/dev/null 2>&1 || {
      echo "⚠️  Warmup request $i failed (non-fatal)"
    }
done

echo "✅ LLM health check passed!"
echo ""
echo "Ready for LLM E2E tests."
exit 0
