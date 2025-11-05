[CmdletBinding()]param()
$ErrorActionPreference='Stop'
function Write-Info($m){ Write-Host "[info] $m" -ForegroundColor Cyan }
function Write-Err($m){ Write-Host "[error] $m" -ForegroundColor Red }

$FILES = @('-f','docker-compose.prod.yml','-f','docker-compose.prod.override.yml')

Write-Info 'Internal /ready via nginx container -> backend'
$internal = docker compose $FILES exec -T nginx sh -lc "wget -q -S -O- http://backend:8000/ready" 2>&1
if ($LASTEXITCODE -eq 0 -and ($internal -match '"ok":true')) { Write-Host 'INTERNAL READY ✓' -ForegroundColor Green } else { Write-Host 'INTERNAL READY ✗' -ForegroundColor Yellow }

Write-Info 'Edge /ready'
$edgeReady = (curl.exe -s -o NUL -w "%{http_code}" https://app.ledger-mind.org/ready)
Write-Host "EDGE /ready HTTP $edgeReady"

Write-Info 'Edge /api/healthz'
$edgeHealth = (curl.exe -s -o NUL -w "%{http_code}" https://app.ledger-mind.org/api/healthz)
Write-Host "EDGE /api/healthz HTTP $edgeHealth"

Write-Info 'Edge /agui/ping'
$aguiPing = (curl.exe -s -o NUL -w "%{http_code}" https://app.ledger-mind.org/agui/ping)
Write-Host "EDGE /agui/ping HTTP $aguiPing"

# Exit codes: 0 if all 200 and internal ok, else non-zero summarizing first failing stage
if ($edgeReady -ne '200' -or $edgeHealth -ne '200' -or $aguiPing -ne '200') {
  Write-Err 'One or more edge endpoints not healthy'
  exit 2
}
if ($internal -notmatch '"ok":true') { exit 1 }
