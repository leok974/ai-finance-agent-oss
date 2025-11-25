# Test quick recap streaming behavior
# Verifies that "give me a quick recap" uses deterministic response

Write-Host "Testing quick recap streaming..." -ForegroundColor Cyan

# Test typed query (mode inference)
Write-Host "`n1. Testing typed query: 'give me a quick recap'" -ForegroundColor Yellow
$response1 = curl -s "http://localhost:8083/api/agent/stream?q=give+me+a+quick+recap&month=2024-11" `
    -H "Cookie: session_id=test" 2>&1

Write-Host "Response sample (first 500 chars):" -ForegroundColor Green
$response1.Substring(0, [Math]::Min(500, $response1.Length))

# Check for "temporarily unavailable" in response
if ($response1 -match "temporarily unavailable") {
    Write-Host "`n❌ FAIL: Response contains 'temporarily unavailable'" -ForegroundColor Red
} else {
    Write-Host "`n✅ PASS: No 'temporarily unavailable' message" -ForegroundColor Green
}

# Check for expected content
if ($response1 -match "Income|Spend|Net") {
    Write-Host "✅ PASS: Response contains financial summary data" -ForegroundColor Green
} else {
    Write-Host "⚠️ WARN: Response may not contain expected summary data" -ForegroundColor Yellow
}

# Test explicit mode parameter
Write-Host "`n2. Testing explicit mode: finance_quick_recap" -ForegroundColor Yellow
$response2 = curl -s "http://localhost:8083/api/agent/stream?q=summary&mode=finance_quick_recap&month=2024-11" `
    -H "Cookie: session_id=test" 2>&1

Write-Host "Response sample (first 500 chars):" -ForegroundColor Green
$response2.Substring(0, [Math]::Min(500, $response2.Length))

if ($response2 -match "temporarily unavailable") {
    Write-Host "`n❌ FAIL: Response contains 'temporarily unavailable'" -ForegroundColor Red
} else {
    Write-Host "`n✅ PASS: No 'temporarily unavailable' message" -ForegroundColor Green
}

Write-Host "`nTest complete!" -ForegroundColor Cyan
