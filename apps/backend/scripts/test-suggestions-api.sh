#!/bin/bash
# Manual test script for ML suggestions API
# Run this to quickly validate the suggestions pipeline end-to-end

set -e

echo "=== ML Suggestions API Smoke Test ==="
echo ""

# Configuration
BASE_URL="${API_BASE_URL:-http://localhost:8000}"
TXN_ID="${TEST_TXN_ID:-999001}"

echo "Using BASE_URL: $BASE_URL"
echo "Using TXN_ID: $TXN_ID"
echo ""

# 1) Test suggestions endpoint
echo "1) Testing suggestions endpoint..."
SUGGEST_RESPONSE=$(curl -s -X POST "$BASE_URL/agent/tools/suggestions" \
  -H 'Content-Type: application/json' \
  -d "{\"txn_ids\":[\"$TXN_ID\"],\"top_k\":3,\"mode\":\"auto\"}")

echo "$SUGGEST_RESPONSE" | jq '.'

# Extract event_id from response
EVENT_ID=$(echo "$SUGGEST_RESPONSE" | jq -r '.items[0].event_id // empty')

if [ -z "$EVENT_ID" ]; then
  echo "❌ ERROR: No event_id in response"
  exit 1
fi

echo ""
echo "✅ Got event_id: $EVENT_ID"
echo ""

# 2) Test feedback endpoint (accept)
echo "2) Testing feedback endpoint (accept action)..."
FEEDBACK_RESPONSE=$(curl -s -X POST "$BASE_URL/agent/tools/suggestions/feedback" \
  -H 'Content-Type: application/json' \
  -d "{\"event_id\":\"$EVENT_ID\",\"action\":\"accept\",\"reason\":\"test_automation\"}")

echo "$FEEDBACK_RESPONSE" | jq '.'

if echo "$FEEDBACK_RESPONSE" | jq -e '.ok == true' > /dev/null; then
  echo "✅ Feedback accepted"
else
  echo "❌ Feedback failed"
  exit 1
fi

echo ""

# 3) Test feedback endpoint (reject)
echo "3) Testing another suggestion for reject flow..."
SUGGEST_RESPONSE2=$(curl -s -X POST "$BASE_URL/agent/tools/suggestions" \
  -H 'Content-Type: application/json' \
  -d "{\"txn_ids\":[\"999002\"],\"top_k\":3,\"mode\":\"auto\"}")

EVENT_ID2=$(echo "$SUGGEST_RESPONSE2" | jq -r '.items[0].event_id // empty')

if [ -n "$EVENT_ID2" ]; then
  REJECT_RESPONSE=$(curl -s -X POST "$BASE_URL/agent/tools/suggestions/feedback" \
    -H 'Content-Type: application/json' \
    -d "{\"event_id\":\"$EVENT_ID2\",\"action\":\"reject\",\"reason\":\"test_automation\"}")

  echo "$REJECT_RESPONSE" | jq '.'
  echo "✅ Reject feedback sent"
fi

echo ""

# 4) Check Prometheus metrics
echo "4) Checking Prometheus metrics..."
curl -s "$BASE_URL/metrics" | grep -E 'lm_suggestions_(total|accept|reject|covered|latency)' | head -20

echo ""
echo "=== Test Complete ==="
