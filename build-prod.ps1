#!/usr/bin/env pwsh
<#
.SYNOPSIS
Build and deploy production Docker containers with git metadata.

.DESCRIPTION
Sets VITE_BUILD_* environment variables from git, then builds and deploys
the nginx container with proper build stamps baked into the bundle.

.PARAMETER NoDeploy
If specified, only builds the image without deploying (up -d).

.EXAMPLE
.\build-prod.ps1
# Sets envs, builds, and deploys nginx

.EXAMPLE
.\build-prod.ps1 -NoDeploy
# Sets envs and builds nginx without deploying
#>

param(
    [switch]$NoDeploy
)

# Capture git metadata from the host
Write-Host "[build-prod] Capturing git metadata..." -ForegroundColor Cyan

$env:VITE_BUILD_BRANCH = (git rev-parse --abbrev-ref HEAD 2>$null)
if (-not $env:VITE_BUILD_BRANCH) {
    Write-Warning "Failed to get git branch, using 'local'"
    $env:VITE_BUILD_BRANCH = "local"
}

$env:VITE_BUILD_COMMIT = (git rev-parse --short HEAD 2>$null)
if (-not $env:VITE_BUILD_COMMIT) {
    Write-Warning "Failed to get git commit, using 'dev'"
    $env:VITE_BUILD_COMMIT = "dev"
}

$env:VITE_BUILD_TIME = (Get-Date).ToUniversalTime().ToString("o")

Write-Host "  VITE_BUILD_BRANCH = $env:VITE_BUILD_BRANCH" -ForegroundColor Green
Write-Host "  VITE_BUILD_COMMIT = $env:VITE_BUILD_COMMIT" -ForegroundColor Green
Write-Host "  VITE_BUILD_TIME   = $env:VITE_BUILD_TIME" -ForegroundColor Green

# Build the nginx container
Write-Host "`n[build-prod] Building nginx container..." -ForegroundColor Cyan
docker compose -f docker-compose.prod.yml build nginx

if ($LASTEXITCODE -ne 0) {
    Write-Error "Build failed with exit code $LASTEXITCODE"
    exit $LASTEXITCODE
}

Write-Host "[build-prod] Build succeeded!" -ForegroundColor Green

# Deploy unless -NoDeploy specified
if (-not $NoDeploy) {
    Write-Host "`n[build-prod] Deploying nginx container..." -ForegroundColor Cyan
    docker compose -f docker-compose.prod.yml up -d nginx

    if ($LASTEXITCODE -ne 0) {
        Write-Error "Deploy failed with exit code $LASTEXITCODE"
        exit $LASTEXITCODE
    }

    Write-Host "[build-prod] Deployment complete!" -ForegroundColor Green

    # Wait a moment then verify
    Start-Sleep -Seconds 2

    Write-Host "`n[build-prod] Verifying build metadata in container..." -ForegroundColor Cyan
    $containerName = "ai-finance-agent-oss-clean-nginx-1"

    Write-Host "  Environment variables:" -ForegroundColor Yellow
    docker exec $containerName sh -c 'env | grep VITE_BUILD || echo "  (no VITE_BUILD_* env vars found - expected after build)"'

    Write-Host "`n  Searching for build stamp in bundle..." -ForegroundColor Yellow
    $pattern = "$env:VITE_BUILD_BRANCH@$env:VITE_BUILD_COMMIT"
    docker exec $containerName sh -c "grep -ao '$pattern' /usr/share/nginx/html/assets/main*.js | head -1" 2>$null

    if ($LASTEXITCODE -eq 0) {
        Write-Host "  ✓ Build stamp found: $pattern" -ForegroundColor Green
    } else {
        Write-Warning "  Build stamp pattern not found - check browser console"
    }

    Write-Host "`n[build-prod] Verification complete!" -ForegroundColor Cyan
    Write-Host "  Open https://app.ledger-mind.org" -ForegroundColor Cyan
    Write-Host "  DevTools Console should show:" -ForegroundColor Cyan
    Write-Host "    🚀 LedgerMind Web  build  $pattern ($env:VITE_BUILD_TIME)" -ForegroundColor Magenta
} else {
    Write-Host "`n[build-prod] Skipping deployment (-NoDeploy specified)" -ForegroundColor Yellow
}
