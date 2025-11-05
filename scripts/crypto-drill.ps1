$ErrorActionPreference = 'Stop'
docker compose -f "$PSScriptRoot/../docker-compose.prod.yml" up -d --force-recreate backend | Out-Null
Start-Sleep -Seconds 5
$mode = (curl -s http://127.0.0.1:8000/ready | ConvertFrom-Json).crypto_mode
if ($mode -ne 'kms') {
  Write-Error "Crypto drill failed: expected kms, got '$mode'"
  exit 1
}
Write-Host "Crypto drill OK (mode=$mode)"
