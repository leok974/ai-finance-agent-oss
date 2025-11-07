# E2E smoke test: suggest → accept → verify DB + metrics
Write-Host "=== E2E Accept Flow Smoke Test ===" -ForegroundColor Cyan
Write-Host ""

# 1. Generate a suggestion
Write-Host "1. Generating suggestion..." -ForegroundColor Yellow
$response = Invoke-RestMethod -Uri "http://localhost:8000/ml/suggestions" `
  -Method Post `
  -ContentType "application/json" `
  -Body '{"merchant":"Amazon","amount":-12.34,"month":"2025-11","description":"test"}'

$response | ConvertTo-Json
Write-Host ""

# 2. Get the suggestion ID
Write-Host "2. Finding latest suggestion ID..." -ForegroundColor Yellow
$id = & psql $env:DATABASE_URL -tA -c "select id from suggestions order by timestamp desc limit 1;"
Write-Host "Latest suggestion ID: $id" -ForegroundColor Green
Write-Host ""

# 3. Accept the suggestion
Write-Host "3. Accepting suggestion $id..." -ForegroundColor Yellow
$acceptResponse = Invoke-RestMethod -Uri "http://localhost:8000/ml/suggestions/$id/accept" -Method Post
$acceptResponse | ConvertTo-Json
Write-Host ""

# 4. Verify DB flip
Write-Host "4. Verifying database update..." -ForegroundColor Yellow
& psql $env:DATABASE_URL -c "select id, label, accepted, source, model_version from suggestions where id=$id;"
Write-Host ""

# 5. Check Prometheus metric
Write-Host "5. Checking Prometheus metric..." -ForegroundColor Yellow
(Invoke-WebRequest -Uri "http://localhost:8000/metrics").Content | Select-String "lm_ml_suggestion_accepts_total" | Select-Object -First 5
Write-Host ""

Write-Host "=== Smoke Test Complete ===" -ForegroundColor Green
