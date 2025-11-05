Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$files = @('docker-compose.prod.yml','docker-compose.prod.override.yml')
$composeArgs = @()
foreach($f in $files){ if(Test-Path $f){ $composeArgs += @('-f',$f) } }
if(-not $composeArgs){ throw 'Compose files not found' }

Write-Host '[prod-local] Stopping stack'
docker compose @composeArgs down
Write-Host '[prod-local] Done.'
