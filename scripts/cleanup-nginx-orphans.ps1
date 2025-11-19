# LedgerMind Nginx Container Cleanup
# PowerShell version of cleanup-nginx-orphans.sh

param(
    [string]$ComposeFile = "docker-compose.prod.yml"
)

$ErrorActionPreference = "Stop"

Write-Host ">>> Expected nginx containers from ${ComposeFile}:" -ForegroundColor Cyan
docker compose -f $ComposeFile ps nginx 2>$null
Write-Host

Write-Host ">>> All nginx-related containers:" -ForegroundColor Cyan
docker ps -a --filter "name=nginx" --format "table {{.Names}}`t{{.Status}}`t{{.Ports}}`t{{.Image}}"
Write-Host

Write-Host ">>> Stopping legacy dev stack (docker-compose.yml)..." -ForegroundColor Yellow
docker compose down nginx 2>$null | Out-Null
Write-Host

Write-Host ">>> Removing orphans via docker compose --remove-orphans..." -ForegroundColor Yellow
docker compose -f $ComposeFile up -d --remove-orphans

Write-Host
Write-Host ">>> After cleanup:" -ForegroundColor Green
docker ps -a --filter "name=nginx" --format "table {{.Names}}`t{{.Status}}`t{{.Ports}}`t{{.Image}}"
