#!/usr/bin/env pwsh
<#
.SYNOPSIS
Deploy Phase 1-3 legacy cleanup to production.

.DESCRIPTION
Complete deployment script for Phase 1-3 legacy rule suggestions cleanup:
1. Run database migration to drop legacy tables
2. Build and deploy updated backend
3. Build and deploy updated frontend (nginx)
4. Verify deployment

.EXAMPLE
.\deploy-phase123.ps1
#>

param(
    [switch]$SkipMigration,
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"

Write-Host "`n==================================================================" -ForegroundColor Cyan
Write-Host "  Phase 1-3 Legacy Cleanup Deployment" -ForegroundColor Cyan
Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host "`nPhase 1: Soft Deprecation (completed)" -ForegroundColor Yellow
Write-Host "Phase 2: Code Removal (11 files deleted, ~530 lines removed)" -ForegroundColor Yellow
Write-Host "Phase 3: ML Hints UI (new transparency panel)" -ForegroundColor Yellow
Write-Host ""

# Step 1: Database Migration
if (-not $SkipMigration) {
    Write-Host "`n[Step 1/4] Running database migration..." -ForegroundColor Cyan
    Write-Host "  Migration: fe374f90af1f (drop rule_suggestions tables)" -ForegroundColor Yellow

    Push-Location apps\backend
    try {
        # Show current migration
        Write-Host "`n  Current migration:" -ForegroundColor Yellow
        python -c "from alembic.config import Config; from alembic import command; cfg = Config('alembic.ini'); command.current(cfg)"

        # Run upgrade
        Write-Host "`n  Running: alembic upgrade head" -ForegroundColor Yellow
        python -m alembic upgrade head

        if ($LASTEXITCODE -ne 0) {
            throw "Migration failed with exit code $LASTEXITCODE"
        }

        # Verify
        Write-Host "`n  Verifying migration..." -ForegroundColor Yellow
        python -c "from alembic.config import Config; from alembic import command; cfg = Config('alembic.ini'); command.current(cfg)"

        Write-Host "  ✓ Migration complete!" -ForegroundColor Green
    }
    finally {
        Pop-Location
    }
} else {
    Write-Host "`n[Step 1/4] SKIPPED: Database migration (-SkipMigration)" -ForegroundColor Yellow
}

# Step 2: Build and deploy backend
if (-not $SkipBuild) {
    Write-Host "`n[Step 2/4] Building backend container..." -ForegroundColor Cyan
    docker compose -f docker-compose.prod.yml build backend

    if ($LASTEXITCODE -ne 0) {
        throw "Backend build failed with exit code $LASTEXITCODE"
    }

    Write-Host "`n  Deploying backend..." -ForegroundColor Cyan
    docker compose -f docker-compose.prod.yml up -d backend

    if ($LASTEXITCODE -ne 0) {
        throw "Backend deploy failed with exit code $LASTEXITCODE"
    }

    Write-Host "  ✓ Backend deployed!" -ForegroundColor Green

    # Wait for backend to be ready
    Write-Host "`n  Waiting for backend to be ready..." -ForegroundColor Yellow
    Start-Sleep -Seconds 5
} else {
    Write-Host "`n[Step 2/4] SKIPPED: Backend build (-SkipBuild)" -ForegroundColor Yellow
}

# Step 3: Build and deploy frontend (nginx)
if (-not $SkipBuild) {
    Write-Host "`n[Step 3/4] Building and deploying frontend..." -ForegroundColor Cyan

    # Use the existing build-prod.ps1 script
    .\build-prod.ps1

    if ($LASTEXITCODE -ne 0) {
        throw "Frontend build/deploy failed with exit code $LASTEXITCODE"
    }

    Write-Host "  ✓ Frontend deployed!" -ForegroundColor Green
} else {
    Write-Host "`n[Step 3/4] SKIPPED: Frontend build (-SkipBuild)" -ForegroundColor Yellow
}

# Step 4: Verification
Write-Host "`n[Step 4/4] Verifying deployment..." -ForegroundColor Cyan

Write-Host "`n  Testing backend health..." -ForegroundColor Yellow
try {
    $healthUrl = "http://localhost:8000/health"
    $health = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 5
    Write-Host "  ✓ Backend health: OK" -ForegroundColor Green
}
catch {
    Write-Warning "  Backend health check failed: $_"
}

Write-Host "`n  Testing new ML hints endpoint..." -ForegroundColor Yellow
try {
    # This will fail with 401 without auth, but proves the endpoint exists
    $hintsUrl = "http://localhost:8000/admin/ml-feedback/hints"
    try {
        $hints = Invoke-RestMethod -Uri $hintsUrl -TimeoutSec 5
    }
    catch {
        if ($_.Exception.Response.StatusCode -eq 401) {
            Write-Host "  ✓ ML hints endpoint exists (401 auth required - expected)" -ForegroundColor Green
        } else {
            throw
        }
    }
}
catch {
    Write-Warning "  ML hints endpoint test failed: $_"
}

Write-Host "`n  Checking for removed legacy endpoints..." -ForegroundColor Yellow
try {
    # This should 404 now
    $legacyUrl = "http://localhost:8000/rules/suggestions"
    try {
        $legacy = Invoke-RestMethod -Uri $legacyUrl -TimeoutSec 5
        Write-Warning "  Legacy endpoint still exists (unexpected)"
    }
    catch {
        if ($_.Exception.Response.StatusCode -eq 404) {
            Write-Host "  ✓ Legacy endpoints removed (404 - expected)" -ForegroundColor Green
        } else {
            throw
        }
    }
}
catch {
    Write-Warning "  Legacy endpoint check failed: $_"
}

Write-Host "`n  Docker containers status:" -ForegroundColor Yellow
docker compose -f docker-compose.prod.yml ps

Write-Host "`n==================================================================" -ForegroundColor Cyan
Write-Host "  Deployment Complete!" -ForegroundColor Green
Write-Host "==================================================================" -ForegroundColor Cyan

Write-Host "`n✓ Phase 2 Changes Deployed:" -ForegroundColor Green
Write-Host "  - Deleted 11 legacy files" -ForegroundColor White
Write-Host "  - Removed ~530 lines of deprecated code" -ForegroundColor White
Write-Host "  - Dropped rule_suggestions and rule_suggestion_ignores tables" -ForegroundColor White
Write-Host "  - Single canonical ML feedback system" -ForegroundColor White

Write-Host "`n✓ Phase 3 Changes Deployed:" -ForegroundColor Green
Write-Host "  - MerchantHintsPanel component (admin-only, dev-mode)" -ForegroundColor White
Write-Host "  - GET /admin/ml-feedback/hints endpoint (paginated)" -ForegroundColor White
Write-Host "  - Transparency into ML-promoted merchant hints" -ForegroundColor White

Write-Host "`n🌐 Application URLs:" -ForegroundColor Cyan
Write-Host "  Frontend: https://app.ledger-mind.org" -ForegroundColor White
Write-Host "  Backend:  http://localhost:8000" -ForegroundColor White

Write-Host "`n📝 Next Steps:" -ForegroundColor Cyan
Write-Host "  1. Test MerchantHintsPanel (enable dev mode, log in as admin)" -ForegroundColor White
Write-Host "  2. Verify legacy endpoints return 404" -ForegroundColor White
Write-Host "  3. Monitor logs for any errors" -ForegroundColor White
Write-Host "  4. Run E2E tests to ensure no regressions" -ForegroundColor White

Write-Host "`n📚 Documentation:" -ForegroundColor Cyan
Write-Host "  - docs/phase1-legacy-deprecation-complete.md" -ForegroundColor White
Write-Host "  - docs/phase2-legacy-code-removal-complete.md" -ForegroundColor White
Write-Host "  - docs/phase3-ml-hints-ui-complete.md" -ForegroundColor White

Write-Host ""
