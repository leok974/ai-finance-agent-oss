# HMAC Smoke Test (PowerShell)
# Fast deterministic smoke test using HMAC auth + stub mode
# Tests: signature generation, stub mode, echo mode

param(
    [string]$BaseUrl = $env:BASE_URL ?? "https://app.ledger-mind.org",
    [string]$AgentPath = $env:AGENT_PATH ?? "/agent/chat",
    [string]$ClientId = $env:E2E_USER ?? $env:HMAC_CLIENT_ID,
    [string]$Secret = $env:E2E_SESSION_HMAC_SECRET ?? $env:HMAC_SECRET
)

if (-not $ClientId -or -not $Secret) {
    Write-Error "Missing credentials. Set E2E_USER/E2E_SESSION_HMAC_SECRET or HMAC_CLIENT_ID/HMAC_SECRET"
    exit 1
}

function Get-SHA256Hex {
    param([string]$Data)
    $bytes = [Text.Encoding]::UTF8.GetBytes($Data)
    $hash = [Security.Cryptography.SHA256]::Create().ComputeHash($bytes)
    return ($hash | ForEach-Object { $_.ToString("x2") }) -join ""
}

function Get-HmacSignature {
    param(
        [string]$Method,
        [string]$Path,
        [string]$Body,
        [string]$Secret,
        [long]$Timestamp
    )
    $bodyHash = Get-SHA256Hex -Data $Body
    $canonical = "$($Method.ToUpper())`n$Path`n$Timestamp`n$bodyHash"
    $hmac = [Security.Cryptography.HMACSHA256]::new([Text.Encoding]::UTF8.GetBytes($Secret))
    $sigBytes = $hmac.ComputeHash([Text.Encoding]::UTF8.GetBytes($canonical))
    return ($sigBytes | ForEach-Object { $_.ToString("x2") }) -join ""
}

function Invoke-HmacRequest {
    param(
        [string]$Url,
        [string]$Path,
        [hashtable]$Payload,
        [string]$TestMode
    )

    $timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    $body = $Payload | ConvertTo-Json -Compress -Depth 10
    $signature = Get-HmacSignature -Method "POST" -Path $Path -Body $body -Secret $Secret -Timestamp $timestamp

    $headers = @{
        "X-Client-Id" = $ClientId
        "X-Timestamp" = $timestamp.ToString()
        "X-Signature" = $signature
        "Content-Type" = "application/json"
        "x-test-mode" = $TestMode
    }

    $sw = [Diagnostics.Stopwatch]::StartNew()
    try {
        $response = Invoke-RestMethod -Uri $Url -Method POST -Headers $headers -Body $body -ErrorAction Stop
        $sw.Stop()
        return @{
            success = $true
            latency = $sw.ElapsedMilliseconds
            response = $response
        }
    } catch {
        $sw.Stop()
        return @{
            success = $false
            latency = $sw.ElapsedMilliseconds
            error = $_.Exception.Message
        }
    }
}

Write-Host "`n=== HMAC Smoke Test ===" -ForegroundColor Cyan
Write-Host "URL: $BaseUrl$AgentPath"
Write-Host "Client: $ClientId"
Write-Host ""

$url = "$BaseUrl$AgentPath"
$passed = 0
$failed = 0

# Test 1: Stub mode
Write-Host "[1/3] Testing stub mode..." -NoNewline
$payload = @{
    messages = @(@{ role = "user"; content = "ping" })
    context = @{ month = "2025-08" }
}
$result = Invoke-HmacRequest -Url $url -Path $AgentPath -Payload $payload -TestMode "stub"
if ($result.success -and $result.response.reply -match "deterministic test reply") {
    Write-Host " ✓ PASS ($($result.latency)ms)" -ForegroundColor Green
    $passed++
} else {
    Write-Host " ✗ FAIL" -ForegroundColor Red
    Write-Host "  Error: $($result.error)" -ForegroundColor Red
    $failed++
}

# Test 2: Echo mode
Write-Host "[2/3] Testing echo mode..." -NoNewline
$payload = @{
    messages = @(@{ role = "user"; content = "test echo" })
    context = @{ month = "2025-08" }
}
$result = Invoke-HmacRequest -Url $url -Path $AgentPath -Payload $payload -TestMode "echo"
if ($result.success -and $result.response.reply -match "\[echo\] test echo") {
    Write-Host " ✓ PASS ($($result.latency)ms)" -ForegroundColor Green
    $passed++
} else {
    Write-Host " ✗ FAIL" -ForegroundColor Red
    Write-Host "  Error: $($result.error)" -ForegroundColor Red
    $failed++
}

# Test 3: Path compatibility (both /agent/chat and /api/agent/chat should work)
if ($AgentPath -eq "/agent/chat") {
    $altPath = "/api/agent/chat"
} else {
    $altPath = "/agent/chat"
}
$altUrl = "$BaseUrl$altPath"

Write-Host "[3/3] Testing path compatibility ($altPath)..." -NoNewline
$payload = @{
    messages = @(@{ role = "user"; content = "ping" })
}
$result = Invoke-HmacRequest -Url $altUrl -Path $altPath -Payload $payload -TestMode "stub"
if ($result.success) {
    Write-Host " ✓ PASS ($($result.latency)ms)" -ForegroundColor Green
    $passed++
} else {
    Write-Host " ✗ FAIL (expected - nginx may not expose both paths)" -ForegroundColor Yellow
    # Don't count as failure - this is optional
}

Write-Host ""
Write-Host "=== Results ===" -ForegroundColor Cyan
Write-Host "Passed: $passed" -ForegroundColor Green
Write-Host "Failed: $failed" -ForegroundColor $(if ($failed -gt 0) { "Red" } else { "Green" })

if ($failed -gt 0) {
    exit 1
}
