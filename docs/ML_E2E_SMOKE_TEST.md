# ML Pipeline E2E Smoke Test (< 1 minute)

**Purpose**: Validate end-to-end ML suggestion flow with acceptance tracking
**Duration**: ~30 seconds
**Prerequisites**: Backend running locally or in Docker

---

## Quick Smoke Test

```bash
# 1. Generate a suggestion
SUGGESTION_RESPONSE=$(curl -s http://localhost:8000/ml/suggestions \
  -H "content-type: application/json" \
  -d '{
    "txn_ids": [1]
  }')

echo "Suggestion Response:"
echo $SUGGESTION_RESPONSE | jq

# Extract suggestion ID from response (first item, first candidate)
# Note: Adjust jq path if your response structure differs
SUGGESTION_ID=$(echo $SUGGESTION_RESPONSE | jq -r '.items[0].candidates[0].id // empty')

if [ -z "$SUGGESTION_ID" ]; then
  echo "❌ No suggestion returned or unable to parse ID"
  exit 1
fi

echo "✅ Suggestion ID: $SUGGESTION_ID"

# 2. Check ML status
echo "\nML Status:"
curl -s http://localhost:8000/ml/status | jq

# 3. Accept the suggestion
ACCEPT_RESPONSE=$(curl -s -X POST http://localhost:8000/ml/suggestions/$SUGGESTION_ID/accept)
echo "\nAccept Response:"
echo $ACCEPT_RESPONSE | jq

# Verify accepted=true
ACCEPTED=$(echo $ACCEPT_RESPONSE | jq -r '.accepted')
if [ "$ACCEPTED" != "true" ]; then
  echo "❌ Accept failed"
  exit 1
fi

echo "✅ Suggestion accepted"

# 4. Verify in database
echo "\nDatabase verification:"
psql "$DATABASE_URL" -c "
  SELECT id, label, confidence, source, model_version, accepted
  FROM suggestions
  WHERE id = $SUGGESTION_ID;
"

# 5. Check Prometheus metrics
echo "\nPrometheus metrics (lm_ml_suggestion_accepts_total):"
curl -s http://localhost:8000/metrics | grep "lm_ml_suggestion_accepts_total"

echo "\n✅ E2E smoke test complete!"
```

---

## PowerShell Version (Windows)

```powershell
# 1. Generate a suggestion
$suggestionResponse = Invoke-RestMethod -Uri "http://localhost:8000/ml/suggestions" `
  -Method Post `
  -ContentType "application/json" `
  -Body '{"txn_ids": [1]}'

Write-Host "Suggestion Response:"
$suggestionResponse | ConvertTo-Json

# Extract suggestion ID (adjust path if needed)
$suggestionId = $suggestionResponse.items[0].candidates[0].id

if (-not $suggestionId) {
  Write-Host "❌ No suggestion returned"
  exit 1
}

Write-Host "✅ Suggestion ID: $suggestionId"

# 2. Check ML status
Write-Host "`nML Status:"
Invoke-RestMethod -Uri "http://localhost:8000/ml/status" | ConvertTo-Json

# 3. Accept the suggestion
$acceptResponse = Invoke-RestMethod -Uri "http://localhost:8000/ml/suggestions/$suggestionId/accept" `
  -Method Post

Write-Host "`nAccept Response:"
$acceptResponse | ConvertTo-Json

if ($acceptResponse.accepted -ne $true) {
  Write-Host "❌ Accept failed"
  exit 1
}

Write-Host "✅ Suggestion accepted"

# 4. Verify in database
Write-Host "`nDatabase verification:"
.\.venv\Scripts\python.exe -c @"
from app.db import SessionLocal
from app.orm_models import Suggestion
db = SessionLocal()
s = db.query(Suggestion).filter(Suggestion.id == $suggestionId).first()
if s:
    print(f'ID={s.id}, Label={s.label}, Confidence={s.confidence:.2f}, Accepted={s.accepted}')
else:
    print('Not found')
db.close()
"@

# 5. Check Prometheus metrics
Write-Host "`nPrometheus metrics:"
(Invoke-WebRequest -Uri "http://localhost:8000/metrics").Content | Select-String "lm_ml_suggestion_accepts_total"

Write-Host "`n✅ E2E smoke test complete!"
```

---

## Individual Component Tests

### Test 1: ML Status Endpoint

```bash
curl -s http://localhost:8000/ml/status | jq
```

**Expected Response**:
```json
{
  "shadow": false,
  "canary": "0",
  "calibration": false,
  "merchant_majority_enabled": true,
  "confidence_threshold": 0.5
}
```

---

### Test 2: Generate Suggestion

```bash
curl -s http://localhost:8000/ml/suggestions \
  -H "content-type: application/json" \
  -d '{
    "txn_ids": [1]
  }' | jq
```

**Expected Response Structure**:
```json
{
  "items": [
    {
      "txn_id": "1",
      "candidates": [
        {
          "label": "Shopping",
          "confidence": 1.0,
          "source": "rule",
          "model_version": "merchant-majority@v1",
          "reasons": [
            {
              "source": "merchant_majority",
              "merchant": "Amazon",
              "support": 5,
              "total": 5,
              "p": 1.0
            }
          ]
        }
      ],
      "event_id": "uuid-string"
    }
  ]
}
```

---

### Test 3: Accept Suggestion

```bash
# Replace 1 with actual suggestion ID
curl -s -X POST http://localhost:8000/ml/suggestions/1/accept | jq
```

**Expected Response**:
```json
{
  "status": "ok",
  "id": 1,
  "accepted": true
}
```

**Idempotent Test** (call again):
```bash
curl -s -X POST http://localhost:8000/ml/suggestions/1/accept | jq
```
Should return same response with `accepted: true`.

---

### Test 4: Database Verification

```sql
-- Check recent suggestions
SELECT id, label, confidence, source, model_version, accepted, timestamp
FROM suggestions
ORDER BY timestamp DESC
LIMIT 5;

-- Count accepted vs not accepted
SELECT
  accepted,
  COUNT(*) as count
FROM suggestions
GROUP BY accepted;
```

---

### Test 5: Prometheus Metrics

```bash
curl -s http://localhost:8000/metrics | grep lm_ml
```

**Expected Metrics**:
```
lm_ml_suggestion_accepts_total{label="Shopping",model_version="merchant-majority@v1",source="rule"} 1.0
lm_ml_merchant_majority_hits_total{merchant_label="Shopping"} 5.0
```

---

## Failure Scenarios

### Test: 404 on Missing Suggestion

```bash
curl -s -X POST http://localhost:8000/ml/suggestions/999999/accept
```

**Expected**:
```json
{
  "detail": "Suggestion not found"
}
```
**Status Code**: 404

---

### Test: Invalid Transaction ID

```bash
curl -s http://localhost:8000/ml/suggestions \
  -H "content-type: application/json" \
  -d '{"txn_ids": ["invalid"]}'
```

**Expected**: HTTP 400 with error message about invalid transaction ID

---

## Success Criteria

- [x] ML status endpoint returns current config
- [x] Suggestion generation works for valid transaction
- [x] Accept endpoint marks suggestion as accepted
- [x] Database shows `accepted=true` after accept call
- [x] Prometheus metric increments after accept
- [x] Idempotent: Multiple accepts don't double-count
- [x] 404 returned for missing suggestion ID

---

## Troubleshooting

### "Connection refused" on localhost:8000
```bash
# Check if backend is running
docker compose ps backend
# Or if running locally
ps aux | grep uvicorn
```

### No suggestions returned
```bash
# Check if transactions exist
psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM transactions;"

# Check if golden set is seeded
psql "$DATABASE_URL" -c "
  SELECT COUNT(*) FROM user_labels ul
  JOIN transactions t ON t.id = ul.txn_id
  WHERE t.merchant = 'Amazon';
"
```

### Metrics not appearing
```bash
# Verify metrics endpoint is accessible
curl -I http://localhost:8000/metrics

# Check if Prometheus is scraping
curl -s http://localhost:9090/api/v1/targets | jq '.data.activeTargets[] | select(.labels.job=="backend")'
```

---

## Next Steps After Passing

1. **Grafana Setup**: Create dashboards using queries from `docs/GRAFANA_ML_PANELS.md`
2. **Backfill**: Run `apps/backend/scripts/backfill_merchant_labels.sql`
3. **Canary Ramp**: Start with `make canary-0` and follow `docs/ML_CANARY_RAMP_PLAYBOOK.md`
4. **Frontend**: Implement `SuggestionCard` component and wire Accept button

---

## Automation

Add to CI/CD:

```yaml
# .github/workflows/ml-smoke.yml
name: ML Smoke Test

on:
  pull_request:
    paths:
      - 'apps/backend/app/services/suggest/**'
      - 'apps/backend/app/routers/suggestions.py'

jobs:
  smoke:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
    steps:
      - uses: actions/checkout@v4
      - name: Run E2E smoke test
        run: |
          cd apps/backend
          # Setup, seed, test
          bash scripts/ml-smoke-test.sh
```
