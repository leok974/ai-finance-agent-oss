#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Quick helper to validate Grafana dashboard JSON files.

.DESCRIPTION
    Runs the dashboard validator script on specified files or all dashboards in ops/grafana/.
    Useful for manual validation before committing or during dashboard development.

.PARAMETER Files
    Array of dashboard JSON file paths to validate. If not specified, validates all files in ops/grafana/.

.PARAMETER Strict
    Exit with non-zero code if any validation fails (default: report only).

.EXAMPLE
    .\scripts\validate-dashboards.ps1
    # Validates all dashboards in ops/grafana/

.EXAMPLE
    .\scripts\validate-dashboards.ps1 -Files "ops/grafana/ml_dashboard.json"
    # Validates a specific dashboard

.EXAMPLE
    .\scripts\validate-dashboards.ps1 -Strict
    # Validates all dashboards and exits with error code if any fail
#>

param(
    [string[]]$Files = @(),
    [switch]$Strict
)

$ErrorActionPreference = 'Stop'

# Find Python executable
$python = Get-Command python -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source
if (-not $python) {
    Write-Error "Python not found in PATH"
    exit 1
}

# Determine files to validate
if ($Files.Count -eq 0) {
    $grafanaDir = Join-Path $PSScriptRoot ".." "ops" "grafana"
    if (Test-Path $grafanaDir) {
        $Files = Get-ChildItem -Path $grafanaDir -Filter "*.json" -Recurse |
                 Select-Object -ExpandProperty FullName

        if ($Files.Count -eq 0) {
            Write-Host "⚠️  No dashboard JSON files found in ops/grafana/" -ForegroundColor Yellow
            exit 0
        }

        Write-Host "🔍 Found $($Files.Count) dashboard file(s) to validate" -ForegroundColor Cyan
    } else {
        Write-Error "Grafana directory not found: $grafanaDir"
        exit 1
    }
}

# Run validator
$validatorScript = Join-Path $PSScriptRoot "validate_grafana_dashboard.py"
if (-not (Test-Path $validatorScript)) {
    Write-Error "Validator script not found: $validatorScript"
    exit 1
}

Write-Host ""
Write-Host "Running dashboard validator..." -ForegroundColor Cyan
Write-Host "Script: $validatorScript" -ForegroundColor Gray
Write-Host ""

# Build command
$cmd = @($python, $validatorScript) + $Files

# Execute
$exitCode = 0
try {
    & $cmd[0] $cmd[1..($cmd.Length-1)]
    $exitCode = $LASTEXITCODE
} catch {
    Write-Error "Validator execution failed: $_"
    exit 1
}

Write-Host ""
if ($exitCode -eq 0) {
    Write-Host "✅ All dashboards validated successfully" -ForegroundColor Green
} else {
    Write-Host "❌ Dashboard validation failed (see errors above)" -ForegroundColor Red
    if ($Strict) {
        exit $exitCode
    }
}

exit $exitCode
