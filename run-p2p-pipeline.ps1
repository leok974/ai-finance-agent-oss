#!/usr/bin/env pwsh
<#
.SYNOPSIS
    P2P/Transfers ML Pipeline - End-to-End Workflow

.DESCRIPTION
    Runs the complete P2P detection and training pipeline:
    1. Export labeled P2P transactions to CSV
    2. Analyze training data statistics
    3. Build ML features with P2P flags
    4. Verify P2P feature extraction
    5. Train ML model with P2P features
    6. Run E2E tests (optional - requires PostgreSQL)

.PARAMETER SkipTests
    Skip E2E Playwright tests (useful for local dev)

.PARAMETER MaxRows
    Maximum rows for ML training (default: 200 for fast runs)

.EXAMPLE
    .\run-p2p-pipeline.ps1
    .\run-p2p-pipeline.ps1 -SkipTests
    .\run-p2p-pipeline.ps1 -MaxRows 500
#>

param(
    [switch]$SkipTests,
    [int]$MaxRows = 200
)

$ErrorActionPreference = "Stop"

Write-Host "`n========================================" -ForegroundColor Magenta
Write-Host "  P2P / Transfers ML Pipeline" -ForegroundColor Magenta
Write-Host "========================================`n" -ForegroundColor Magenta

# Verify we're in repo root
if (-not (Test-Path "apps/backend/app/ml/train.py")) {
    Write-Host "❌ Error: Run this script from the repository root" -ForegroundColor Red
    exit 1
}

# =============================================================================
# STEP 1: Export P2P Training Data
# =============================================================================
Write-Host "`n=== STEP 1: Export P2P Training Data ===`n" -ForegroundColor Cyan

Set-Location apps/backend

if (Test-Path "data/p2p_training.csv") {
    $csvSize = (Get-Item "data/p2p_training.csv").Length
    Write-Host "Found existing p2p_training.csv ($csvSize bytes)" -ForegroundColor Yellow
    Write-Host "Skipping export. Delete the file to force re-export.`n"
} else {
    Write-Host "Exporting P2P transactions to CSV..." -ForegroundColor White
    .\.venv\Scripts\python.exe -m app.scripts.export_p2p_training --min-date 2025-01

    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Export failed (exit code $LASTEXITCODE)" -ForegroundColor Red
        Set-Location ../..
        exit $LASTEXITCODE
    }

    if (Test-Path "data/p2p_training.csv") {
        $rows = (Get-Content "data/p2p_training.csv" | Measure-Object -Line).Lines - 1
        Write-Host "✅ Exported $rows P2P transactions`n" -ForegroundColor Green
    } else {
        Write-Host "⚠️  No P2P training data found (CSV not created)`n" -ForegroundColor Yellow
    }
}

Set-Location ../..

# =============================================================================
# STEP 2: Analyze Training Data
# =============================================================================
Write-Host "`n=== STEP 2: Analyze Training Data ===`n" -ForegroundColor Cyan

Set-Location apps/backend

if (Test-Path "data/p2p_training.csv") {
    .\.venv\Scripts\python.exe -m app.scripts.analyze_p2p_training

    if ($LASTEXITCODE -ne 0) {
        Write-Host "⚠️  Analysis failed (exit code $LASTEXITCODE)" -ForegroundColor Yellow
        Write-Host "Continuing anyway...`n"
    }
} else {
    Write-Host "⚠️  Skipping analysis (no CSV file)`n" -ForegroundColor Yellow
}

Set-Location ../..

# =============================================================================
# STEP 3: Build ML Features
# =============================================================================
Write-Host "`n=== STEP 3: Build ML Features with P2P Flags ===`n" -ForegroundColor Cyan

Set-Location apps/backend

Write-Host "Building features for last 60 days..." -ForegroundColor White
.\.venv\Scripts\python.exe -m app.ml.feature_build --days 60

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Feature build failed (exit code $LASTEXITCODE)" -ForegroundColor Red
    Set-Location ../..
    exit $LASTEXITCODE
}

Write-Host "✅ Features built successfully`n" -ForegroundColor Green

Set-Location ../..

# =============================================================================
# STEP 4: Verify P2P Feature Extraction
# =============================================================================
Write-Host "`n=== STEP 4: Verify P2P Feature Extraction ===`n" -ForegroundColor Cyan

Set-Location apps/backend

Write-Host "Querying ml_features for P2P flags..." -ForegroundColor White
.\.venv\Scripts\python.exe -c @"
from app.db import SessionLocal
from app.ml.models import MLFeature
from sqlalchemy import select

db = SessionLocal()
try:
    stmt = select(MLFeature).where(MLFeature.feat_p2p_flag == True).limit(5)
    features = db.execute(stmt).scalars().all()

    if features:
        print(f'\n✅ Found {len(features)} transactions with P2P flags:')
        for f in features:
            print(f'  - txn_id={f.txn_id}, merchant={f.merchant}, p2p_flag={f.feat_p2p_flag}, large_outflow={f.feat_p2p_large_outflow}')
    else:
        print('\n⚠️  No P2P features found in database')
        print('   This may indicate no P2P transactions in the dataset.')
finally:
    db.close()
"@

if ($LASTEXITCODE -ne 0) {
    Write-Host "⚠️  Verification query failed (exit code $LASTEXITCODE)" -ForegroundColor Yellow
    Write-Host "Continuing anyway...`n"
}

Write-Host ""
Set-Location ../..

# =============================================================================
# STEP 5: Train ML Model with P2P Features
# =============================================================================
Write-Host "`n=== STEP 5: Train ML Model with P2P Features ===`n" -ForegroundColor Cyan

Set-Location apps/backend

Write-Host "Training with max_rows=$MaxRows (fast dev run)..." -ForegroundColor White

# Create data directory if needed
if (-not (Test-Path "data")) {
    New-Item -ItemType Directory -Path "data" | Out-Null
}

# Fast dev run: small sample, JSON metrics for inspection
.\.venv\Scripts\python.exe -m app.ml.train --max-rows $MaxRows --out-json data/p2p_train_metrics.json

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ P2P training failed (exit code $LASTEXITCODE)" -ForegroundColor Red
    Set-Location ../..
    exit $LASTEXITCODE
}

# Display metrics if available
if (Test-Path "data/p2p_train_metrics.json") {
    Write-Host "`n📊 Training Metrics:" -ForegroundColor Cyan
    Get-Content "data/p2p_train_metrics.json" | ConvertFrom-Json | ConvertTo-Json -Depth 5
}

Write-Host "`n✅ Training completed successfully`n" -ForegroundColor Green

Set-Location ../..

# =============================================================================
# STEP 6: Run E2E Tests (Optional)
# =============================================================================
if (-not $SkipTests) {
    Write-Host "`n=== STEP 6: Run E2E Tests ===`n" -ForegroundColor Cyan

    Set-Location apps/web

    if (-not $env:BASE_URL) {
        $env:BASE_URL = "https://app.ledger-mind.org"
    }

    Write-Host "Running P2P Suggestions E2E test..." -ForegroundColor White
    pnpm exec playwright test tests/e2e/suggestions-p2p.spec.ts --project=chromium-prod 2>&1 | Out-Null

    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Suggestions E2E test passed" -ForegroundColor Green
    } else {
        Write-Host "⚠️  Suggestions E2E test failed (requires PostgreSQL)" -ForegroundColor Yellow
    }

    Write-Host ""
    Set-Location ../..
} else {
    Write-Host "`n⏭️  Skipping E2E tests (--SkipTests flag)`n" -ForegroundColor Yellow
}

# =============================================================================
# Summary
# =============================================================================
Write-Host "`n========================================" -ForegroundColor Magenta
Write-Host "  ✅ P2P Pipeline Complete!" -ForegroundColor Green
Write-Host "========================================`n" -ForegroundColor Magenta

Write-Host "Generated Artifacts:" -ForegroundColor Cyan
Write-Host "  📄 data/p2p_training.csv - Training data export"
Write-Host "  📊 data/p2p_train_metrics.json - Training metrics"
Write-Host "  🤖 models/p2p_classifier.joblib - Trained model"

Write-Host "`nNext Steps:" -ForegroundColor Cyan
Write-Host "  1. Review training metrics in data/p2p_train_metrics.json"
Write-Host "  2. Test model predictions with test transactions"
Write-Host "  3. Run full training on production data (increase --max-rows)"
Write-Host "  4. Deploy model to backend for inference`n"
