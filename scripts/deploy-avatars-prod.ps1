#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Deploy avatar backend changes to production

.DESCRIPTION
    Automates deployment of backend /auth/me updates, nginx CSP changes,
    and frontend rebuild for Google photo avatar support.

.PARAMETER SkipBuild
    Skip frontend build step (use existing dist/)

.PARAMETER SkipBackend
    Skip backend rebuild/restart

.PARAMETER SkipNginx
    Skip nginx config update

.PARAMETER DryRun
    Show what would be done without executing

.EXAMPLE
    .\deploy-avatars-prod.ps1
    Deploy all changes to production

.EXAMPLE
    .\deploy-avatars-prod.ps1 -SkipBuild
    Deploy without rebuilding frontend

.EXAMPLE
    .\deploy-avatars-prod.ps1 -DryRun
    Show deployment steps without executing
#>

param(
    [switch]$SkipBuild,
    [switch]$SkipBackend,
    [switch]$SkipNginx,
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot

function Write-Step {
    param([string]$Message)
    Write-Host "`n==> $Message" -ForegroundColor Cyan
}

function Write-Success {
    param([string]$Message)
    Write-Host "✓ $Message" -ForegroundColor Green
}

function Write-Warning {
    param([string]$Message)
    Write-Host "⚠ $Message" -ForegroundColor Yellow
}

function Write-Error {
    param([string]$Message)
    Write-Host "✗ $Message" -ForegroundColor Red
}

function Invoke-Command {
    param(
        [string]$Command,
        [string]$Description
    )

    Write-Host "  $ $Command" -ForegroundColor DarkGray

    if ($DryRun) {
        Write-Warning "DRY RUN: Would execute: $Command"
        return $true
    }

    try {
        Invoke-Expression $Command
        return $true
    } catch {
        Write-Error "$Description failed: $_"
        return $false
    }
}

# Start deployment
Write-Host @"

╔════════════════════════════════════════════════════════════╗
║  LedgerMind - Avatar Backend Production Deployment         ║
╚════════════════════════════════════════════════════════════╝

"@ -ForegroundColor Cyan

# Pre-flight checks
Write-Step "Pre-flight checks"

# Check git status
$gitStatus = git status --porcelain
if ($gitStatus) {
    Write-Warning "Uncommitted changes detected:"
    Write-Host $gitStatus
    $continue = Read-Host "Continue anyway? (y/N)"
    if ($continue -ne "y") {
        Write-Error "Deployment cancelled"
        exit 1
    }
}
Write-Success "Git status OK"

# Check branch
$branch = git branch --show-current
if ($branch -ne "ml-pipeline-2.1") {
    Write-Warning "Not on ml-pipeline-2.1 branch (current: $branch)"
    $continue = Read-Host "Continue anyway? (y/N)"
    if ($continue -ne "y") {
        Write-Error "Deployment cancelled"
        exit 1
    }
}
Write-Success "Branch: $branch"

# Check docker context
$context = docker context show
Write-Host "  Docker context: $context"
if ($context -ne "desktop-linux") {
    Write-Warning "Not using desktop-linux context"
    $continue = Read-Host "Continue anyway? (y/N)"
    if ($continue -ne "y") {
        Write-Error "Deployment cancelled"
        exit 1
    }
}
Write-Success "Docker context OK"

# Step 1: Build Frontend
if (-not $SkipBuild) {
    Write-Step "Building frontend"

    Push-Location "$RepoRoot\apps\web"

    # Install dependencies
    if (-not (Invoke-Command "pnpm install" "pnpm install")) {
        Pop-Location
        exit 1
    }

    # Run typecheck
    Write-Host "  Running typecheck..."
    if (-not (Invoke-Command "pnpm run typecheck" "typecheck")) {
        Pop-Location
        exit 1
    }

    # Build production bundle
    Write-Host "  Building production bundle..."
    if (-not (Invoke-Command "pnpm run build" "build")) {
        Pop-Location
        exit 1
    }

    # Verify dist exists
    if (-not (Test-Path "dist\index.html")) {
        Write-Error "dist/index.html not found after build"
        Pop-Location
        exit 1
    }

    Write-Success "Frontend built successfully"
    Pop-Location
} else {
    Write-Warning "Skipping frontend build"
}

# Step 2: Deploy Backend
if (-not $SkipBackend) {
    Write-Step "Deploying backend"

    # Stop backend
    Write-Host "  Stopping backend container..."
    Invoke-Command "docker --context desktop-linux compose -f ops/docker-compose.prod.yml stop backend" "stop backend"

    # Rebuild backend image
    Write-Host "  Rebuilding backend image..."
    if (-not (Invoke-Command "docker --context desktop-linux compose -f ops/docker-compose.prod.yml build backend" "build backend")) {
        Write-Error "Backend build failed"
        # Restart old backend
        Invoke-Command "docker --context desktop-linux compose -f ops/docker-compose.prod.yml up -d backend" "restart backend"
        exit 1
    }

    # Start backend
    Write-Host "  Starting backend..."
    if (-not (Invoke-Command "docker --context desktop-linux compose -f ops/docker-compose.prod.yml up -d backend" "start backend")) {
        Write-Error "Backend start failed"
        exit 1
    }

    # Wait for backend to be healthy
    Write-Host "  Waiting for backend to be ready..."
    Start-Sleep -Seconds 5

    # Check backend logs
    Write-Host "  Checking backend logs..."
    $logs = docker --context desktop-linux compose -f ops/docker-compose.prod.yml logs --tail=20 backend
    if ($logs -match "ERROR|CRITICAL|Exception") {
        Write-Warning "Backend logs contain errors:"
        Write-Host $logs -ForegroundColor Yellow
        $continue = Read-Host "Continue anyway? (y/N)"
        if ($continue -ne "y") {
            exit 1
        }
    }

    Write-Success "Backend deployed successfully"
} else {
    Write-Warning "Skipping backend deployment"
}

# Step 3: Update Nginx Configuration
if (-not $SkipNginx) {
    Write-Step "Updating nginx configuration"

    # Test nginx config syntax
    Write-Host "  Testing nginx config syntax..."
    $nginxTest = docker --context desktop-linux compose -f ops/docker-compose.prod.yml exec -T nginx nginx -t 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Nginx config test failed:"
        Write-Host $nginxTest -ForegroundColor Red
        exit 1
    }

    # Reload nginx
    Write-Host "  Reloading nginx..."
    if (-not (Invoke-Command "docker --context desktop-linux compose -f ops/docker-compose.prod.yml exec nginx nginx -s reload" "reload nginx")) {
        Write-Error "Nginx reload failed"
        exit 1
    }

    # Verify CSP includes Google hosts
    Write-Host "  Verifying CSP configuration..."
    $csp = docker --context desktop-linux compose -f ops/docker-compose.prod.yml exec -T nginx cat /etc/nginx/conf.d/app.conf | Select-String "img-src"
    if ($csp -match "googleusercontent.com") {
        Write-Success "CSP includes Google image hosts"
    } else {
        Write-Warning "CSP may not include Google image hosts"
        Write-Host "  Current CSP: $csp" -ForegroundColor Yellow
    }

    Write-Success "Nginx updated successfully"
} else {
    Write-Warning "Skipping nginx update"
}

# Step 4: Deploy Frontend (if built)
if (-not $SkipBuild) {
    Write-Step "Deploying frontend"

    # Note: Adjust this based on your deployment method
    # This assumes nginx has a volume mount to dist/
    Write-Warning "Frontend deployment may require manual steps"
    Write-Host "  Built files are in: $RepoRoot\apps\web\dist\"
    Write-Host "  Copy to nginx webroot or restart nginx if volume-mounted"

    # If nginx has direct volume mount, just restart
    $restartNginx = Read-Host "Restart nginx to pick up new frontend files? (Y/n)"
    if ($restartNginx -ne "n") {
        Invoke-Command "docker --context desktop-linux compose -f ops/docker-compose.prod.yml restart nginx" "restart nginx"
        Write-Success "Nginx restarted"
    }
}

# Step 5: Verification
Write-Step "Verification"

# Check backend health
Write-Host "  Checking backend health..."
$backendStatus = docker --context desktop-linux compose -f ops/docker-compose.prod.yml ps backend
Write-Host $backendStatus

# Check nginx health
Write-Host "  Checking nginx health..."
$nginxStatus = docker --context desktop-linux compose -f ops/docker-compose.prod.yml ps nginx
Write-Host $nginxStatus

# Test /auth/me endpoint (requires token)
Write-Host "`n  To test /auth/me endpoint:"
Write-Host "  curl -H 'Authorization: Bearer YOUR_TOKEN' https://ledger-mind.org/auth/me" -ForegroundColor Gray

# Summary
Write-Host @"

╔════════════════════════════════════════════════════════════╗
║  Deployment Summary                                        ║
╚════════════════════════════════════════════════════════════╝

"@ -ForegroundColor Green

Write-Success "Backend: $(if ($SkipBackend) { 'SKIPPED' } else { 'DEPLOYED' })"
Write-Success "Nginx: $(if ($SkipNginx) { 'SKIPPED' } else { 'UPDATED' })"
Write-Success "Frontend: $(if ($SkipBuild) { 'SKIPPED' } else { 'BUILT' })"

Write-Host @"

Next steps:
1. Test OAuth login: https://ledger-mind.org
2. Verify avatar shows initial immediately
3. Check browser DevTools for CSP errors
4. Monitor logs for 5-10 minutes

View logs:
  docker --context desktop-linux compose -f ops/docker-compose.prod.yml logs -f backend nginx

"@ -ForegroundColor Cyan

if ($DryRun) {
    Write-Warning "DRY RUN COMPLETE - No changes were made"
}
