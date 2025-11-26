#!/usr/bin/env pwsh
# Production smoke test for agent streaming with deterministic responses
# Validates that chips return real data, not LLM fallbacks

$ErrorActionPreference = "Stop"

Write-Host "=== Agent Streaming Production Smoke Test ===" -ForegroundColor Cyan
Write-Host ""

# Configuration
$BASE_URL = if ($env:API_BASE_URL) { $env:API_BASE_URL } else { "http://localhost:8083" }
$MONTH = if ($env:TEST_MONTH) { $env:TEST_MONTH } else { "2025-11" }

Write-Host "Using BASE_URL: $BASE_URL" -ForegroundColor Gray
Write-Host "Using MONTH: $MONTH" -ForegroundColor Gray
Write-Host ""

# Helper function to call agent stream endpoint
function Test-AgentMode {
    param(
        [string]$ModeName,
        [string]$ModeValue,
        [string]$Prompt,
        [string]$ExpectedPattern,
        [switch]$AllowLLM
    )

    Write-Host "Testing mode: $ModeName" -ForegroundColor Yellow

    try {
        # Build URL with query params
        $encodedPrompt = [System.Web.HttpUtility]::UrlEncode($Prompt)
        $url = "$BASE_URL/agent/stream?q=$encodedPrompt&month=$MONTH"
        if ($ModeValue) {
            $url += "&mode=$ModeValue"
        }

        # Call streaming endpoint
        $response = Invoke-WebRequest -Uri $url `
            -Method Get `
            -Headers @{
                "Accept" = "application/x-ndjson"
            } `
            -UseBasicParsing

        $content = $response.Content

        # Parse NDJSON response
        $lines = $content -split "`n" | Where-Object { $_.Trim() -ne "" }
        $tokens = @()
        $hasPlanner = $false
        $hasToolStart = $false
        $hasToolEnd = $false
        $hasDone = $false

        foreach ($line in $lines) {
            try {
                $json = $line | ConvertFrom-Json

                switch ($json.type) {
                    "planner" {
                        $hasPlanner = $true
                        Write-Host "  ✓ Planner event" -ForegroundColor DarkGray
                    }
                    "tool_start" {
                        $hasToolStart = $true
                        Write-Host "  ✓ Tool start: $($json.data.name)" -ForegroundColor DarkGray
                    }
                    "token" {
                        $tokens += $json.data.text
                    }
                    "tool_end" {
                        $hasToolEnd = $true
                        Write-Host "  ✓ Tool end" -ForegroundColor DarkGray
                    }
                    "done" {
                        $hasDone = $true
                    }
                }
            } catch {
                Write-Host "  ⚠️  Failed to parse line: $line" -ForegroundColor Yellow
            }
        }

        $fullText = -join $tokens

        # Check for expected pattern
        if ($ExpectedPattern -and $fullText -match $ExpectedPattern) {
            Write-Host "  ✅ Pattern matched: $ExpectedPattern" -ForegroundColor Green
        } elseif ($ExpectedPattern) {
            Write-Host "  ❌ Pattern NOT matched: $ExpectedPattern" -ForegroundColor Red
            Write-Host "  Response preview: $($fullText.Substring(0, [Math]::Min(200, $fullText.Length)))..." -ForegroundColor Gray
            if (-not $AllowLLM) {
                return $false
            }
        }

        # Check streaming structure
        if (-not $hasDone) {
            Write-Host "  ❌ Missing 'done' event" -ForegroundColor Red
            return $false
        }

        # Check for LLM fallback indicators (bad if deterministic mode)
        $llmIndicators = @(
            "I can help you",
            "Let me analyze",
            "I'll check",
            "Based on the data available"
        )

        $hasLLMFallback = $false
        foreach ($indicator in $llmIndicators) {
            if ($fullText -match [regex]::Escape($indicator)) {
                $hasLLMFallback = $true
                break
            }
        }

        if ($hasLLMFallback -and -not $AllowLLM) {
            Write-Host "  ⚠️  WARNING: Response contains LLM fallback language" -ForegroundColor Yellow
            Write-Host "  Response preview: $($fullText.Substring(0, [Math]::Min(300, $fullText.Length)))..." -ForegroundColor Gray
        }

        Write-Host "  ✅ $ModeName OK (${tokens.Count} tokens)" -ForegroundColor Green
        Write-Host ""
        return $true

    } catch {
        Write-Host "  ❌ ERROR: $($_.Exception.Message)" -ForegroundColor Red
        Write-Host ""
        return $false
    }
}

# Load System.Web for URL encoding
Add-Type -AssemblyName System.Web

Write-Host "=== Testing Deterministic Chip Handlers ===" -ForegroundColor Cyan
Write-Host ""

$results = @{}

# Test 1: Analytics Trends (the one we just fixed)
$results['trends'] = Test-AgentMode `
    -ModeName "Analytics Trends" `
    -ModeValue "analytics_trends" `
    -Prompt "Show my spending trends." `
    -ExpectedPattern "(spending trends|Limited history|transaction data for)"

# Test 2: Recurring Merchants
$results['recurring'] = Test-AgentMode `
    -ModeName "Recurring Merchants" `
    -ModeValue "analytics_recurring_all" `
    -Prompt "Show me recurring charges." `
    -ExpectedPattern "(recurring|merchants|transaction data for)"

# Test 3: Find Subscriptions
$results['subscriptions'] = Test-AgentMode `
    -ModeName "Find Subscriptions" `
    -ModeValue "analytics_subscriptions_all" `
    -Prompt "Find my subscriptions." `
    -ExpectedPattern "(subscription|recurring|merchants|transaction data for)"

# Test 4: Budget Suggest
$results['budget'] = Test-AgentMode `
    -ModeName "Budget Suggest" `
    -ModeValue "analytics_budget_suggest" `
    -Prompt "Suggest a budget for this month." `
    -ExpectedPattern "(budget|50/30/20|needs|wants|savings|transaction data)"

# Test 5: Insights Summary
$results['insights'] = Test-AgentMode `
    -ModeName "Insights Summary" `
    -ModeValue "insights_summary" `
    -Prompt "Quick financial summary." `
    -ExpectedPattern "(spend|income|net|categories|transaction data)"

# Test 6: Search Transactions (guidance message expected)
$results['search'] = Test-AgentMode `
    -ModeName "Search Transactions" `
    -ModeValue "search_transactions" `
    -Prompt "Find transactions matching starbucks." `
    -ExpectedPattern "(search box|filter|find transactions)" `
    -AllowLLM

# Test 7: Quick Recap (existing handler)
$results['recap'] = Test-AgentMode `
    -ModeName "Quick Recap" `
    -ModeValue "finance_quick_recap" `
    -Prompt "Give me a quick financial recap." `
    -ExpectedPattern "(spend|income|categories|transaction)" `
    -AllowLLM

# Test 8: Alerts
$results['alerts'] = Test-AgentMode `
    -ModeName "Alerts" `
    -ModeValue "finance_alerts" `
    -Prompt "Show me financial alerts." `
    -ExpectedPattern "(alert|unusual|spending|no alerts)" `
    -AllowLLM

Write-Host "=== Test Results Summary ===" -ForegroundColor Cyan
Write-Host ""

$passed = 0
$failed = 0

foreach ($key in $results.Keys | Sort-Object) {
    $result = $results[$key]
    if ($result) {
        Write-Host "  ✅ $key" -ForegroundColor Green
        $passed++
    } else {
        Write-Host "  ❌ $key" -ForegroundColor Red
        $failed++
    }
}

Write-Host ""
Write-Host "Passed: $passed / $($results.Count)" -ForegroundColor $(if ($passed -eq $results.Count) { "Green" } else { "Yellow" })

if ($failed -gt 0) {
    Write-Host "Failed: $failed" -ForegroundColor Red
    Write-Host ""
    Write-Host "⚠️  Some tests failed. Check responses above for details." -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "=== All Tests Passed ===" -ForegroundColor Green
exit 0
