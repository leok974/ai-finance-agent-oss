# LedgerMind Production Nginx Deployment
# PowerShell version of deploy-ledgermind-nginx.sh

param(
    [string]$ComposeFile = "docker-compose.prod.yml"
)

$ErrorActionPreference = "Stop"

$BRANCH = git rev-parse --abbrev-ref HEAD
$COMMIT = git rev-parse --short=8 HEAD
$BUILD_TIME = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")

Write-Host ">>> Deploying LedgerMind nginx" -ForegroundColor Cyan
Write-Host "    branch = $BRANCH"
Write-Host "    commit = $COMMIT"
Write-Host "    build_time = $BUILD_TIME"
Write-Host "    compose = $ComposeFile"
Write-Host

# 1) Build nginx image
Write-Host ">>> Building nginx image (--no-cache)..." -ForegroundColor Yellow
$env:VITE_GIT_BRANCH = $BRANCH
$env:VITE_GIT_COMMIT = $COMMIT
$env:BUILD_TIME = $BUILD_TIME

docker compose -f $ComposeFile build --no-cache nginx
if ($LASTEXITCODE -ne 0) {
    Write-Error "Docker build failed"
    exit 1
}

# 2) Recreate nginx container
Write-Host ">>> Recreating nginx container..." -ForegroundColor Yellow
docker compose -f $ComposeFile up -d --force-recreate nginx
if ($LASTEXITCODE -ne 0) {
    Write-Error "Container recreation failed"
    exit 1
}

# 3) Restart tunnels if present (best-effort)
$cfdContainers = docker ps --format '{{.Names}}' | Select-String -Pattern 'cfd-a'
if ($cfdContainers) {
    Write-Host ">>> Restarting Cloudflare tunnels (cfd-a, cfd-b)..." -ForegroundColor Yellow
    docker restart cfd-a cfd-b 2>$null | Out-Null
}

Write-Host
Write-Host ">>> Done. Now run: scripts\check-ledgermind-prod-version.ps1" -ForegroundColor Green
