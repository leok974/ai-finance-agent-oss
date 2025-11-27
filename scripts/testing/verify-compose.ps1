$ErrorActionPreference = 'Stop'
$yml = Get-Content "$PSScriptRoot/../docker-compose.prod.yml" -Raw
if ($yml -notmatch 'ENCRYPTION_ENABLED:\s*"1"') {
  Write-Error "ENCRYPTION_ENABLED must be 1 in prod compose file"
  exit 1
}
Write-Host "verify-compose: OK (ENCRYPTION_ENABLED=1)"
