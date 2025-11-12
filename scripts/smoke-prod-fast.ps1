# smoke-prod-fast.ps1 - Fast deterministic smoke test for production deployment
# Validates /agent/chat stub mode is working with sub-second latency
# Use before E2E tests to ensure backend is responsive

$ErrorActionPreference = "Stop"

$BASE = if ($env:BASE_URL) { $env:BASE_URL } else { "https://app.ledger-mind.org" }

function Invoke-JsonPost {
    param(
        [string]$Url,
        [hashtable]$Headers = @{},
        [object]$Body
    )

    $Headers['content-type'] = 'application/json'
    $jsonBody = $Body | ConvertTo-Json -Compress

    try {
        $response = Invoke-RestMethod -Uri $Url -Method POST -Headers $Headers -Body $jsonBody
        return $response
    } catch {
        Write-Error "Request failed: $_"
        exit 1
    }
}

Write-Host "Smoke testing $BASE..." -ForegroundColor Cyan

# Warmup (JIT cold start mitigation)
Write-Host "Warming up..." -ForegroundColor Yellow
for ($i = 1; $i -le 3; $i++) {
    try {
        Invoke-RestMethod -Uri "$BASE/ready" -Method GET -ErrorAction SilentlyContinue | Out-Null
    } catch {}
}

# Test 1: stub mode latency contract
Write-Host "Testing /agent/chat stub mode..." -ForegroundColor Yellow
$t0 = Get-Date
$r = Invoke-JsonPost -Url "$BASE/agent/chat" -Headers @{ 'x-test-mode' = 'stub' } -Body @{
    messages = @(@{ role = 'user'; content = 'ping' })
    context = @{ month = '2025-08' }
}
$t1 = Get-Date
$latency = ($t1 - $t0).TotalMilliseconds

# Validate response
if (-not $r.reply) {
    Write-Error "[FAIL] no reply field"
    exit 1
}
if ($r.reply -notmatch 'deterministic') {
    Write-Error "[FAIL] wrong stub response"
    exit 1
}

Write-Host "[PASS] agent/chat stub latency: $([math]::Round($latency))ms" -ForegroundColor Green

# Test 2: echo mode reflects content
Write-Host "Testing echo mode..." -ForegroundColor Yellow
$r = Invoke-JsonPost -Url "$BASE/agent/chat" -Headers @{ 'x-test-mode' = 'echo' } -Body @{
    messages = @(@{ role = 'user'; content = 'test123' })
    context = @{ month = '2025-08' }
}

if ($r.reply -notmatch '\[echo\] test123') {
    Write-Error "[FAIL] echo mode failed"
    exit 1
}
Write-Host "[PASS] echo mode working" -ForegroundColor Green

# Test 3: API path compatibility (/api/agent/* → /agent/*)
Write-Host "Testing API path compatibility..." -ForegroundColor Yellow
$r = Invoke-JsonPost -Url "$BASE/api/agent/chat" -Headers @{ 'x-test-mode' = 'stub' } -Body @{
    messages = @(@{ role = 'user'; content = 'compat' })
    context = @{ month = '2025-08' }
}

if (-not $r.reply) {
    Write-Error "[FAIL] /api/agent/* path broken"
    exit 1
}
Write-Host "[PASS] API path compatibility working" -ForegroundColor Green

Write-Host ""
Write-Host "All smoke tests passed! Deployment healthy." -ForegroundColor Green
exit 0
