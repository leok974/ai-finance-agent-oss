# Manual test script for ML suggestions API (PowerShell)
# Run this to quickly validate the suggestions pipeline end-to-end

$ErrorActionPreference = "Stop"

Write-Host "=== ML Suggestions API Smoke Test ===" -ForegroundColor Cyan
Write-Host ""

# Configuration
$BASE_URL = if ($env:API_BASE_URL) { $env:API_BASE_URL } else { "http://localhost" }
$TXN_ID = if ($env:TEST_TXN_ID) { $env:TEST_TXN_ID } else { "999001" }

Write-Host "Using BASE_URL: $BASE_URL"
Write-Host "Using TXN_ID: $TXN_ID"
Write-Host ""

# 1) Test suggestions endpoint
Write-Host "1) Testing suggestions endpoint..." -ForegroundColor Yellow
$suggestBody = @{
    txn_ids = @($TXN_ID)
    top_k = 3
    mode = "auto"
} | ConvertTo-Json

try {
    $suggestResponse = Invoke-RestMethod -Uri "$BASE_URL/ml/suggestions" `
        -Method Post `
        -ContentType "application/json" `
        -Body $suggestBody

    $suggestResponse | ConvertTo-Json -Depth 10

    $eventId = $suggestResponse.items[0].event_id

    if (-not $eventId) {
        Write-Host "❌ ERROR: No event_id in response" -ForegroundColor Red
        exit 1
    }

    Write-Host ""
    Write-Host "✅ Got event_id: $eventId" -ForegroundColor Green
    Write-Host ""
} catch {
    Write-Host "❌ ERROR: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# 2) Test feedback endpoint (accept)
Write-Host "2) Testing feedback endpoint (accept action)..." -ForegroundColor Yellow
$feedbackBody = @{
    event_id = $eventId
    action = "accept"
    reason = "test_automation"
} | ConvertTo-Json

try {
    $feedbackResponse = Invoke-RestMethod -Uri "$BASE_URL/ml/suggestions/feedback" `
        -Method Post `
        -ContentType "application/json" `
        -Body $feedbackBody

    $feedbackResponse | ConvertTo-Json

    if ($feedbackResponse.ok -eq $true) {
        Write-Host "✅ Feedback accepted" -ForegroundColor Green
    } else {
        Write-Host "❌ Feedback failed" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "❌ ERROR: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Write-Host ""

# 3) Test feedback endpoint (reject)
Write-Host "3) Testing another suggestion for reject flow..." -ForegroundColor Yellow
$suggestBody2 = @{
    txn_ids = @("999002")
    top_k = 3
    mode = "auto"
} | ConvertTo-Json

try {
    $suggestResponse2 = Invoke-RestMethod -Uri "$BASE_URL/ml/suggestions" `
        -Method Post `
        -ContentType "application/json" `
        -Body $suggestBody2

    $eventId2 = $suggestResponse2.items[0].event_id

    if ($eventId2) {
        $rejectBody = @{
            event_id = $eventId2
            action = "reject"
            reason = "test_automation"
        } | ConvertTo-Json

        $rejectResponse = Invoke-RestMethod -Uri "$BASE_URL/ml/suggestions/feedback" `
            -Method Post `
            -ContentType "application/json" `
            -Body $rejectBody

        $rejectResponse | ConvertTo-Json
        Write-Host "✅ Reject feedback sent" -ForegroundColor Green
    }
} catch {
    Write-Host "⚠️  Reject test skipped: $($_.Exception.Message)" -ForegroundColor Yellow
}

Write-Host ""

# 4) Check Prometheus metrics
Write-Host "4) Checking Prometheus metrics..." -ForegroundColor Yellow
try {
    $metrics = Invoke-WebRequest -Uri "$BASE_URL/metrics" -UseBasicParsing
    $metrics.Content -split "`n" | Select-String -Pattern "lm_suggestions_(total|accept|reject|covered|latency)" | Select-Object -First 20
} catch {
    Write-Host "⚠️  Could not fetch metrics: $($_.Exception.Message)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=== Test Complete ===" -ForegroundColor Cyan
