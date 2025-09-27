Param(
  [string]$Base = "https://app.ledger-mind.org",
  [switch]$Logs
)
$FILES = @('-f','docker-compose.prod.yml','-f','docker-compose.prod.override.yml')
$ErrorActionPreference = 'Stop'

Write-Host "== Ensuring nginx + backend + cloudflared are up ==" -ForegroundColor Cyan
# Use default context unless specified; adjust if Docker context differs
 docker compose $FILES up -d nginx backend cloudflared | Out-Null

if ($Logs) {
  Write-Host "== cloudflared logs (tail 120) ==" -ForegroundColor Cyan
  docker compose $FILES logs --tail=120 cloudflared
}

Write-Host "== Edge checks ==" -ForegroundColor Cyan
try { (Invoke-WebRequest "$Base/ready" -Method Head -TimeoutSec 5).StatusCode | Out-Null; Write-Host "✅ /ready ok" } catch { Write-Host "❌ /ready" }
try { (Invoke-WebRequest "$Base/api/healthz" -Method Head -TimeoutSec 5).StatusCode | Out-Null; Write-Host "✅ /healthz ok" } catch { Write-Host "❌ /healthz" }
