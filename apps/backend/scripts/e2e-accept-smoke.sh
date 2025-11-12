#!/bin/bash
# E2E smoke test: suggest → accept → verify DB + metrics
set -e

echo "=== E2E Accept Flow Smoke Test ==="
echo ""

# 1. Generate a suggestion
echo "1. Generating suggestion..."
RESPONSE=$(curl -s http://localhost:8000/ml/suggestions \
  -H "content-type: application/json" \
  -d '{"merchant":"Amazon","amount":-12.34,"month":"2025-11","description":"test"}')

echo "$RESPONSE" | jq .
echo ""

# 2. Get the suggestion ID
echo "2. Finding latest suggestion ID..."
ID=$(psql "$DATABASE_URL" -tA -c "select id from suggestions order by timestamp desc limit 1;")
echo "Latest suggestion ID: $ID"
echo ""

# 3. Accept the suggestion
echo "3. Accepting suggestion $ID..."
ACCEPT_RESPONSE=$(curl -s -X POST "http://localhost:8000/ml/suggestions/$ID/accept")
echo "$ACCEPT_RESPONSE" | jq .
echo ""

# 4. Verify DB flip
echo "4. Verifying database update..."
psql "$DATABASE_URL" -c "select id, label, accepted, source, model_version from suggestions where id=$ID;"
echo ""

# 5. Check Prometheus metric
echo "5. Checking Prometheus metric..."
curl -s http://localhost:8000/metrics | grep lm_ml_suggestion_accepts_total | head -5
echo ""

echo "=== Smoke Test Complete ==="
