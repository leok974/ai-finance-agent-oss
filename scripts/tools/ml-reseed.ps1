<#
.SYNOPSIS
    Wipe ML model and reseed categories/rules for the categorization system.

.DESCRIPTION
    This script:
    1. Removes the ML model file (wipes learned patterns)
    2. Reseeds the database with default categories and rules

    Useful for:
    - Resetting the ML system to factory defaults
    - Testing categorization from a clean slate
    - Recovering from corrupted ML models

.PARAMETER ComposeFile
    Path to docker-compose file. Defaults to docker-compose.yml for local dev.
    Use "docker-compose.prod.yml" or full path for production.

.EXAMPLE
    .\ml-reseed.ps1
    Wipes and reseeds using default docker-compose.yml

.EXAMPLE
    .\ml-reseed.ps1 -ComposeFile "docker-compose.prod.yml"
    Wipes and reseeds production environment
#>

param(
    [string]$ComposeFile = "docker-compose.yml"
)

$ErrorActionPreference = "Stop"

Write-Host "[ml-reseed] Starting ML model wipe and reseed..." -ForegroundColor Cyan

# Step 1: Wipe ML model
Write-Host "`n[1/2] Wiping ML model file..." -ForegroundColor Yellow
try {
    docker compose -f $ComposeFile exec -T backend python -m app.scripts.ml_model_tools wipe
    Write-Host "[✓] ML model wiped" -ForegroundColor Green
} catch {
    Write-Host "[✗] Failed to wipe ML model: $_" -ForegroundColor Red
    exit 1
}

# Step 2: Reseed categories and rules
Write-Host "`n[2/2] Reseeding categories and rules..." -ForegroundColor Yellow
try {
    docker compose -f $ComposeFile exec -T backend python -m app.scripts.seed_categories
    Write-Host "[✓] Categories and rules reseeded" -ForegroundColor Green
} catch {
    Write-Host "[✗] Failed to reseed: $_" -ForegroundColor Red
    exit 1
}

Write-Host "`n[ml-reseed] Complete! ML model wiped and categories/rules restored." -ForegroundColor Cyan
Write-Host "The system will start learning from scratch as users categorize transactions." -ForegroundColor Gray
