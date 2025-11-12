# LLM Health Check - Warm up and verify LLM availability
# Usage: .\scripts\llm-health.ps1
# Exits 0 if LLM healthy, 1 otherwise

$ErrorActionPreference = "Stop"

$BASE = if ($env:BASE_URL) { $env:BASE_URL } else { "https://app.ledger-mind.org" }

Write-Host "🔍 Checking LLM health at $BASE..." -ForegroundColor Cyan

# Check /agent/status endpoint
Write-Host "📡 Fetching /agent/status..." -ForegroundColor Yellow
try {
    $status = Invoke-RestMethod -Uri "$BASE/agent/status" -Method GET
} catch {
    Write-Host "❌ Status endpoint unreachable: $_" -ForegroundColor Red
    exit 1
}

# Parse llm_ok field
$llmOk = $status.llm_ok

if ($llmOk -ne $true) {
    Write-Host "❌ LLM not ready (llm_ok: $llmOk)" -ForegroundColor Red
    Write-Host "   Full status: $($status | ConvertTo-Json -Compress)" -ForegroundColor Red
    exit 1
}

Write-Host "✅ LLM status: OK" -ForegroundColor Green

# Warmup: Send 2 requests to prime model and caches
Write-Host "🔥 Warming up LLM (2 requests)..." -ForegroundColor Yellow
for ($i = 1; $i -le 2; $i++) {
    try {
        Invoke-RestMethod -Uri "$BASE/agent/chat" -Method POST `
            -Headers @{
                'content-type' = 'application/json'
                'x-test-mode' = 'stub'
            } `
            -Body '{"messages":[{"role":"user","content":"warmup"}],"force_llm":false}' `
            -ErrorAction SilentlyContinue | Out-Null
    } catch {
        Write-Host "⚠️  Warmup request $i failed (non-fatal)" -ForegroundColor Yellow
    }
}

Write-Host "✅ LLM health check passed!" -ForegroundColor Green
Write-Host ""
Write-Host "Ready for LLM E2E tests." -ForegroundColor Cyan
exit 0
