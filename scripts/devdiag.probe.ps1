#!/usr/bin/env pwsh
# DevDiag probe script for Windows
param(
    [string]$Url = "https://app.ledger-mind.org/?chat=diag",
    [string]$Preset = "app"
)

$ErrorActionPreference = "Stop"

# Ensure mcp-devdiag is installed
try {
    pip show mcp-devdiag *>$null
} catch {
    Write-Host "Installing mcp-devdiag..." -ForegroundColor Yellow
    pip install -q "mcp-devdiag[playwright,export]==0.2.1"
}

# Run probe
Write-Host "Running devdiag probe on $Url with preset=$Preset..." -ForegroundColor Cyan
try {
    mcp-devdiag probe --url $Url --preset $Preset --format json --export
} catch {
    Write-Warning "Probe encountered errors (continuing...)"
}

# Show artifacts
Write-Host ""
Write-Host "Artifacts:" -ForegroundColor Green
if (Test-Path "artifacts/devdiag") {
    Get-ChildItem "artifacts/devdiag" | Format-Table Name, Length, LastWriteTime
} else {
    Write-Warning "No artifacts directory found"
}
