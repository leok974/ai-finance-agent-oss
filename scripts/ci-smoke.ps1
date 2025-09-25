param(
  [string]$Nginx = "ai-finance-agent-oss-clean-nginx-1",
  [string]$Backend = "ai-finance-agent-oss-clean-backend-1"
)

$ErrorActionPreference = 'Stop'

function Invoke-Inside([string]$ctr, [string]$cmd) {
  docker exec $ctr sh -lc $cmd
}

Write-Host "[smoke] Root via nginx" -ForegroundColor Cyan
Invoke-Inside $Nginx "curl -sSI http://127.0.0.1/ | head -n 1"
Write-Host "[smoke] Favicon via nginx" -ForegroundColor Cyan
Invoke-Inside $Nginx "curl -sSI http://127.0.0.1/favicon.ico | head -n 1"
Write-Host "[smoke] Agent models via backend" -ForegroundColor Cyan
Invoke-Inside $Nginx "curl -sSI http://backend:8000/agent/models | head -n 1"
Write-Host "[smoke] Agent models via nginx" -ForegroundColor Cyan
Invoke-Inside $Nginx "curl -sSI http://127.0.0.1/agent/models | head -n 1"
