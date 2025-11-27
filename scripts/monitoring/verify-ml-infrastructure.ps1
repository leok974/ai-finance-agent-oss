#!/usr/bin/env pwsh
# ML Infrastructure Verification Script
# Verifies all ML components are properly configured

param(
    [switch]$Verbose,
    [switch]$Json
)

$ErrorActionPreference = 'Continue'
$results = @{
    timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    checks = @()
    summary = @{
        total = 0
        passed = 0
        failed = 0
        warnings = 0
    }
}

function Add-Check {
    param(
        [string]$Name,
        [string]$Status,  # pass, fail, warn
        [string]$Message,
        [hashtable]$Details = @{}
    )
    
    $results.checks += @{
        name = $Name
        status = $Status
        message = $Message
        details = $Details
    }
    
    $results.summary.total++
    switch ($Status) {
        'pass' { $results.summary.passed++ }
        'fail' { $results.summary.failed++ }
        'warn' { $results.summary.warnings++ }
    }
    
    if (-not $Json) {
        $icon = switch ($Status) {
            'pass' { '✅' }
            'fail' { '❌' }
            'warn' { '⚠️' }
        }
        Write-Host "$icon $Name`: $Message"
        if ($Verbose -and $Details.Count -gt 0) {
            $Details.GetEnumerator() | ForEach-Object {
                Write-Host "   $($_.Key): $($_.Value)"
            }
        }
    }
}

# ============================================================================
# 1. FILE EXISTENCE CHECKS
# ============================================================================

Write-Host "`n🔍 Checking file structure..." -ForegroundColor Cyan

$requiredFiles = @(
    # Backend ML
    'apps/backend/app/config.py',
    'apps/backend/app/metrics_ml.py',
    'apps/backend/app/ml/serve.py',
    'apps/backend/app/ml/train.py',
    'apps/backend/app/ml/model.py',
    'apps/backend/app/scripts/verify_calibrator.py',
    
    # Tests
    'apps/backend/tests/test_ml_canary_thresholds.py',
    'apps/backend/tests/test_ml_calibration.py',
    'apps/backend/tests/test_registry_calibrator.py',
    'apps/web/tests/e2e/ml-canary.spec.ts',
    
    # Warehouse
    'warehouse/models/sources.yml',
    'warehouse/models/marts/fct_training_view.sql',
    'warehouse/models/marts/ml_marts.yml',
    'warehouse/models/exposures.yml',
    'warehouse/tests/generic/not_in_future.sql',
    'warehouse/tests/generic/not_after_month_end.sql',
    'warehouse/Makefile',
    
    # Observability
    'ops/grafana/dashboards/ml-canary-overview.json',
    'ops/grafana/dashboards/ml-source-freshness.json',
    'prometheus/rules/ml_phase3.yml',
    'prometheus/rules/dbt_freshness.yml',
    
    # Documentation
    'ML_CANARY_DEPLOYMENT.md',
    'ML_CANARY_QUICK_REF.md',
    'DATA_QUALITY_COMPLETE.md',
    'ML_OBSERVABILITY_COMPLETE.md',
    'ML_SUMMARY.md',
    'TESTING_COMPLETE.md'
)

$missingFiles = @()
foreach ($file in $requiredFiles) {
    if (Test-Path $file) {
        if ($Verbose) {
            Add-Check "File: $file" 'pass' 'Exists'
        }
    } else {
        $missingFiles += $file
        Add-Check "File: $file" 'fail' 'Missing'
    }
}

if ($missingFiles.Count -eq 0) {
    Add-Check 'File Structure' 'pass' "All $($requiredFiles.Count) files present"
} else {
    Add-Check 'File Structure' 'fail' "$($missingFiles.Count) files missing" @{
        missing = ($missingFiles -join ', ')
    }
}

# ============================================================================
# 2. DBT CONFIGURATION CHECKS
# ============================================================================

Write-Host "`n🗄️  Checking dbt configuration..." -ForegroundColor Cyan

# Check sources.yml has freshness config
$sourcesContent = Get-Content 'warehouse/models/sources.yml' -Raw
if ($sourcesContent -match 'warn_after:' -and $sourcesContent -match 'error_after:') {
    Add-Check 'dbt Freshness SLOs' 'pass' 'Configured in sources.yml'
} else {
    Add-Check 'dbt Freshness SLOs' 'fail' 'Missing in sources.yml'
}

# Check exposures.yml has ml_training_pipeline
$exposuresContent = Get-Content 'warehouse/models/exposures.yml' -Raw
if ($exposuresContent -match 'ml_training_pipeline') {
    Add-Check 'dbt ML Exposure' 'pass' 'ml_training_pipeline defined'
} else {
    Add-Check 'dbt ML Exposure' 'fail' 'ml_training_pipeline missing'
}

# Check fct_training_view has label_observed_at
$trainingViewContent = Get-Content 'warehouse/models/marts/fct_training_view.sql' -Raw
if ($trainingViewContent -match 'label_observed_at') {
    Add-Check 'Training View Schema' 'pass' 'label_observed_at column present'
} else {
    Add-Check 'Training View Schema' 'fail' 'label_observed_at column missing'
}

# Check custom tests exist
$customTests = @('not_in_future.sql', 'not_after_month_end.sql')
foreach ($test in $customTests) {
    if (Test-Path "warehouse/tests/generic/$test") {
        Add-Check "Custom Test: $test" 'pass' 'Exists'
    } else {
        Add-Check "Custom Test: $test" 'fail' 'Missing'
    }
}

# ============================================================================
# 3. MAKEFILE TARGET CHECKS
# ============================================================================

Write-Host "`n⚙️  Checking Makefile targets..." -ForegroundColor Cyan

$makefileContent = Get-Content 'Makefile' -Raw
$requiredTargets = @(
    'ml-features',
    'ml-train',
    'ml-eval',
    'ml-status',
    'ml-predict',
    'ml-thresholds',
    'ml-canary',
    'ml-tests',
    'ml-verify-calibration',
    'ml-dash-import',
    'ml-dash-import-freshness'
)

$missingTargets = @()
foreach ($target in $requiredTargets) {
    if ($makefileContent -match "$target`:") {
        if ($Verbose) {
            Add-Check "Makefile: $target" 'pass' 'Defined'
        }
    } else {
        $missingTargets += $target
        Add-Check "Makefile: $target" 'fail' 'Missing'
    }
}

if ($missingTargets.Count -eq 0) {
    Add-Check 'Makefile Targets' 'pass' "All $($requiredTargets.Count) targets present"
} else {
    Add-Check 'Makefile Targets' 'warn' "$($missingTargets.Count) targets missing" @{
        missing = ($missingTargets -join ', ')
    }
}

# ============================================================================
# 4. GRAFANA DASHBOARD VALIDATION
# ============================================================================

Write-Host "`n📊 Checking Grafana dashboards..." -ForegroundColor Cyan

$dashboards = @(
    'ops/grafana/dashboards/ml-canary-overview.json',
    'ops/grafana/dashboards/ml-source-freshness.json'
)

foreach ($dashboard in $dashboards) {
    if (Test-Path $dashboard) {
        try {
            $json = Get-Content $dashboard -Raw | ConvertFrom-Json
            $panelCount = $json.dashboard.panels.Count
            Add-Check "Dashboard: $(Split-Path $dashboard -Leaf)" 'pass' "$panelCount panels" @{
                title = $json.dashboard.title
                panels = $panelCount
            }
        } catch {
            Add-Check "Dashboard: $(Split-Path $dashboard -Leaf)" 'fail' "Invalid JSON: $_"
        }
    } else {
        Add-Check "Dashboard: $(Split-Path $dashboard -Leaf)" 'fail' 'Missing'
    }
}

# ============================================================================
# 5. PROMETHEUS RULES VALIDATION
# ============================================================================

Write-Host "`n🔔 Checking Prometheus rules..." -ForegroundColor Cyan

$ruleFiles = @(
    'prometheus/rules/ml_phase3.yml',
    'prometheus/rules/dbt_freshness.yml'
)

foreach ($ruleFile in $ruleFiles) {
    if (Test-Path $ruleFile) {
        try {
            # Basic YAML validation (PowerShell doesn't have native YAML parser)
            $content = Get-Content $ruleFile -Raw
            if ($content -match 'groups:' -and $content -match 'rules:') {
                $ruleCount = ([regex]::Matches($content, '- alert:')).Count
                Add-Check "Rules: $(Split-Path $ruleFile -Leaf)" 'pass' "$ruleCount alerts defined" @{
                    alerts = $ruleCount
                }
            } else {
                Add-Check "Rules: $(Split-Path $ruleFile -Leaf)" 'warn' 'Possibly malformed YAML'
            }
        } catch {
            Add-Check "Rules: $(Split-Path $ruleFile -Leaf)" 'fail' "Parse error: $_"
        }
    } else {
        Add-Check "Rules: $(Split-Path $ruleFile -Leaf)" 'fail' 'Missing'
    }
}

# ============================================================================
# 6. DOCUMENTATION CHECKS
# ============================================================================

Write-Host "`n📚 Checking documentation..." -ForegroundColor Cyan

$docs = @{
    'ML_CANARY_DEPLOYMENT.md' = 400
    'ML_CANARY_QUICK_REF.md' = 200
    'DATA_QUALITY_COMPLETE.md' = 300
    'ML_OBSERVABILITY_COMPLETE.md' = 400
    'ML_SUMMARY.md' = 300
}

foreach ($doc in $docs.GetEnumerator()) {
    if (Test-Path $doc.Key) {
        $lineCount = (Get-Content $doc.Key).Count
        if ($lineCount -ge $doc.Value) {
            Add-Check "Doc: $($doc.Key)" 'pass' "$lineCount lines (>= $($doc.Value))"
        } else {
            Add-Check "Doc: $($doc.Key)" 'warn' "$lineCount lines (expected >= $($doc.Value))"
        }
    } else {
        Add-Check "Doc: $($doc.Key)" 'fail' 'Missing'
    }
}

# ============================================================================
# 7. CI/CD INTEGRATION CHECKS
# ============================================================================

Write-Host "`n🔄 Checking CI/CD integration..." -ForegroundColor Cyan

$ciContent = Get-Content '.github/workflows/ml.yml' -Raw
$ciSteps = @(
    'Build features',
    'DBT Source Freshness Check',
    'DBT Tests',
    'Train model',
    'Verify calibrator'
)

foreach ($step in $ciSteps) {
    if ($ciContent -match $step) {
        if ($Verbose) {
            Add-Check "CI Step: $step" 'pass' 'Configured'
        }
    } else {
        Add-Check "CI Step: $step" 'warn' 'Not found in workflow'
    }
}

# ============================================================================
# SUMMARY
# ============================================================================

Write-Host "`n" -NoNewline
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Gray
Write-Host "📋 VERIFICATION SUMMARY" -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Gray

$passRate = if ($results.summary.total -gt 0) { 
    [math]::Round(($results.summary.passed / $results.summary.total) * 100, 1) 
} else { 
    0 
}

if (-not $Json) {
    Write-Host ""
    Write-Host "Total Checks:  $($results.summary.total)" -ForegroundColor White
    Write-Host "✅ Passed:     $($results.summary.passed)" -ForegroundColor Green
    Write-Host "❌ Failed:     $($results.summary.failed)" -ForegroundColor Red
    Write-Host "⚠️  Warnings:   $($results.summary.warnings)" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Pass Rate:     $passRate%" -ForegroundColor $(if ($passRate -ge 90) { 'Green' } elseif ($passRate -ge 70) { 'Yellow' } else { 'Red' })
    Write-Host ""
    
    if ($results.summary.failed -eq 0 -and $results.summary.warnings -eq 0) {
        Write-Host "🎉 All checks passed! ML infrastructure is complete." -ForegroundColor Green
        exit 0
    } elseif ($results.summary.failed -eq 0) {
        Write-Host "✅ All critical checks passed (some warnings present)." -ForegroundColor Yellow
        exit 0
    } else {
        Write-Host "⚠️  Some checks failed. Review output above." -ForegroundColor Red
        exit 1
    }
} else {
    $results | ConvertTo-Json -Depth 10
    exit $(if ($results.summary.failed -eq 0) { 0 } else { 1 })
}
