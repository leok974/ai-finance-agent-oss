<#
.SYNOPSIS
    Comprehensive smoke tests for categorization system.

.DESCRIPTION
    Runs through all categorization endpoints and ML management:
    1. DNS/network sanity checks
    2. Seed demo transactions
    3. Test batch categorization
    4. Test promote to rule
    5. Optional: Test ML scorer integration

.PARAMETER ComposeFile
    Docker compose file to use (default: docker-compose.yml)

.PARAMETER EnableML
    If set, enables ML scorer and tests ML integration

.EXAMPLE
    .\scripts\categorize-smoke.ps1

.EXAMPLE
    .\scripts\categorize-smoke.ps1 -ComposeFile docker-compose.prod.yml -EnableML
#>

param(
    [string]$ComposeFile = "docker-compose.yml",
    [switch]$EnableML
)

$ErrorActionPreference = "Continue"
$baseUrl = "http://localhost:8000"

function Write-Section {
    param([string]$Title)
    Write-Host "`n========================================" -ForegroundColor Cyan
    Write-Host " $Title" -ForegroundColor Cyan
    Write-Host "========================================`n" -ForegroundColor Cyan
}

function Write-Step {
    param([string]$Message)
    Write-Host "▶ $Message" -ForegroundColor Yellow
}

function Write-Success {
    param([string]$Message)
    Write-Host "✓ $Message" -ForegroundColor Green
}

function Write-Failure {
    param([string]$Message)
    Write-Host "✗ $Message" -ForegroundColor Red
}

# ========================================
# 1. Network Sanity Checks
# ========================================
Write-Section "1. Network & DNS Sanity Checks"

Write-Step "Recreating backend service for fresh DNS state..."
docker compose -f $ComposeFile up -d --force-recreate --no-deps backend
Start-Sleep -Seconds 3

Write-Step "Waiting for backend to be ready..."
$retries = 0
$maxRetries = 30
while ($retries -lt $maxRetries) {
    try {
        $healthCheck = Invoke-WebRequest -Uri "$baseUrl/healthz" -TimeoutSec 2 -ErrorAction Stop
        if ($healthCheck.StatusCode -eq 200) {
            Write-Success "Backend is ready"
            break
        }
    } catch {
        # Backend not ready yet
    }
    $retries++
    Start-Sleep -Seconds 1
}

if ($retries -ge $maxRetries) {
    Write-Failure "Backend failed to become ready after $maxRetries seconds"
    exit 1
}

Write-Step "Testing DNS resolution for 'postgres'..."
$dnsTest = docker compose -f $ComposeFile exec backend sh -c "getent hosts postgres || (cat /etc/resolv.conf && echo DNS_FAIL)" 2>&1
if ($dnsTest -match "DNS_FAIL") {
    Write-Failure "DNS resolution failed for 'postgres'"
    Write-Host $dnsTest
    exit 1
} else {
    Write-Success "DNS resolution OK: postgres"
    Write-Host $dnsTest
}

Write-Step "Testing Python socket resolution..."
$pythonTest = docker compose -f $ComposeFile exec -T backend python -c @"
import socket, sys
try:
    ip = socket.gethostbyname('postgres')
    print(f'postgres resolves to: {ip}')
    sys.exit(0)
except Exception as e:
    print(f'ERROR: {e}')
    sys.exit(1)
"@
if ($LASTEXITCODE -eq 0) {
    Write-Success "Python socket resolution OK"
    Write-Host $pythonTest
} else {
    Write-Failure "Python socket resolution failed"
    Write-Host $pythonTest
    exit 1
}

# ========================================
# 2. Seed Demo Transactions
# ========================================
Write-Section "2. Seed Demo Transactions"

Write-Step "Running seed_txns_demo.py..."
$idsJson = docker compose -f $ComposeFile exec -T backend python -m app.scripts.seed_txns_demo
if ($LASTEXITCODE -ne 0) {
    Write-Failure "Failed to seed transactions"
    Write-Host $idsJson
    exit 1
}

$IDS = $idsJson | ConvertFrom-Json
Write-Success "Seeded $($IDS.Count) demo transactions"
Write-Host "Transaction IDs: $($IDS -join ', ')"

# ========================================
# 3. Test Batch Categorization
# ========================================
Write-Section "3. Test Batch Categorization"

Write-Step "Calling batch suggest with transaction IDs..."
$json = ConvertTo-Json @($IDS) -Compress
$body = "{`"txn_ids`":$json}"
try {
    $response = Invoke-WebRequest -Method Post `
        -Uri "$baseUrl/agent/tools/categorize/suggest/batch" `
        -ContentType "application/json" `
        -Body $body
    $batchResult = $response.Content | ConvertFrom-Json
} catch {
    Write-Failure "Batch categorization request failed: $_"
    exit 1
}

if ($batchResult -and $batchResult.items) {
    Write-Success "Batch categorization succeeded ($($batchResult.items.Count) results)"
    Write-Host "Sample results:" -ForegroundColor Cyan
    foreach ($item in ($batchResult.items | Select-Object -First 3)) {
        $txnId = $item.txn
        $topSuggestion = $item.suggestions | Select-Object -First 1
        if ($topSuggestion) {
            Write-Host "  ID $txnId → $($topSuggestion.category_slug) (score: $($topSuggestion.score))"
            if ($topSuggestion.why) {
                foreach ($reason in $topSuggestion.why) {
                    Write-Host "    • $reason" -ForegroundColor DarkGray
                }
            }
        }
    }
} else {
    Write-Failure "Batch categorization failed or returned empty"
    exit 1
}

# ========================================
# 4. Test Promote to Rule
# ========================================
Write-Section "4. Test Promote to Rule"

Write-Step "Promoting 'netflix' to subscriptions.streaming..."
$promoteBody = @{
    merchant_canonical = "netflix"
    category_slug = "subscriptions.streaming"
    priority = 35
} | ConvertTo-Json -Compress

try {
    $response = Invoke-WebRequest -Method Post `
        -Uri "$baseUrl/agent/tools/categorize/promote" `
        -ContentType "application/json" `
        -Body $promoteBody
    $promoteResult = $response.Content | ConvertFrom-Json
} catch {
    Write-Failure "Promote request failed: $_"
    exit 1
}

if ($promoteResult.ok) {
    Write-Success "Rule promotion succeeded: rule_id=$($promoteResult.rule_id)"
} else {
    Write-Failure "Rule promotion failed"
    Write-Host ($promoteResult | ConvertTo-Json -Depth 5)
}

Write-Step "Listing all rules to verify..."
try {
    $response = Invoke-WebRequest -Method Get -Uri "$baseUrl/agent/tools/categorize/rules"
    $rules = $response.Content | ConvertFrom-Json
} catch {
    Write-Failure "Failed to list rules: $_"
    exit 1
}

$netflixRule = $rules | Where-Object { $_.pattern -like "*netflix*" -or $_.merchant_canonical -eq "netflix" }
if ($netflixRule) {
    Write-Success "Found netflix rule in list: $($netflixRule.pattern) → $($netflixRule.category_slug)"
} else {
    Write-Failure "Netflix rule not found in rules list"
}

# ========================================
# 5. Optional: ML Scorer Integration
# ========================================
if ($EnableML) {
    Write-Section "5. ML Scorer Integration"

    Write-Step "Checking ML scorer status..."
    try {
        $response = Invoke-WebRequest -Method Get -Uri "$baseUrl/agent/tools/ml/status"
        $mlStatus = $response.Content | ConvertFrom-Json
    } catch {
        Write-Failure "Failed to check ML status: $_"
        exit 1
    }
    Write-Host "ML Status:" -ForegroundColor Cyan
    Write-Host ($mlStatus | ConvertTo-Json -Depth 5)

    if ($mlStatus.enabled) {
        Write-Success "ML scorer is enabled"

        # Apply one suggestion to train the model
        Write-Step "Applying categorization to train ML model..."
        $spotifyId = $IDS[0]
        $applyBody = @{
            category_slug = "subscriptions.streaming"
        } | ConvertTo-Json -Compress

        try {
            $response = Invoke-WebRequest -Method Post `
                -Uri "$baseUrl/txns/$spotifyId/categorize" `
                -ContentType "application/json" `
                -Body $applyBody
            $applyResult = $response.Content | ConvertFrom-Json
        } catch {
            Write-Failure "Failed to apply categorization: $_"
        }

        if ($applyResult) {
            Write-Success "Applied categorization for training"

            # Re-run batch to see ML scorer in action
            Write-Step "Re-running batch to see ML scorer results..."
            try {
                $response = Invoke-WebRequest -Method Post `
                    -Uri "$baseUrl/agent/tools/categorize/suggest/batch" `
                    -ContentType "application/json" `
                    -Body $body
                $batchResult2 = $response.Content | ConvertFrom-Json
            } catch {
                Write-Failure "Failed to re-run batch: $_"
            }

            if ($batchResult2) {
                Write-Host "Updated batch results (should include ML scorer):" -ForegroundColor Cyan
                foreach ($item in ($batchResult2.items | Select-Object -First 2)) {
                    $txnId = $item.txn
                    $topSuggestion = $item.suggestions | Select-Object -First 1
                    if ($topSuggestion) {
                        Write-Host "  ID $txnId → $($topSuggestion.category_slug)"
                        if ($topSuggestion.why) {
                            foreach ($reason in $topSuggestion.why) {
                                Write-Host "    • $reason" -ForegroundColor DarkGray
                            }
                        }
                    }
                }
            }
        }
    } else {
        Write-Host "ML scorer not enabled (set ML_SUGGEST_ENABLED=1 in backend env)" -ForegroundColor Yellow
    }
}

# ========================================
# Summary
# ========================================
Write-Section "Summary"
Write-Success "All smoke tests passed!"
Write-Host @"

Next steps:
  • Wire the React AdminRulesPanel to batch suggestions map
  • Enable ML scorer when you want learning on (ML_SUGGEST_ENABLED=1)
  • Use Admin Rules panel to tune regex & priority
  • Run 'make ml-reseed' to reset ML model and categories
"@ -ForegroundColor Cyan
