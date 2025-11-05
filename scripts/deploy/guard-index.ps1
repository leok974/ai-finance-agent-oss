Param(
  [string[]]$ComposeFiles = @('docker-compose.prod.yml','docker-compose.prod.override.yml'),
  [string]$Service = 'nginx'
)
$ErrorActionPreference = 'Stop'
function Info($m){ Write-Host "[guard-index] $m" }
$filesArgs = @()
foreach($f in $ComposeFiles){ $filesArgs += '-f'; $filesArgs += $f }
docker compose $filesArgs exec -T $Service sh -lc "grep -q '/src/main.tsx' /usr/share/nginx/html/index.html"
if($LASTEXITCODE -eq 0){
  Write-Error 'Dev index detected (references /src/main.tsx) inside running container.'
}
Info 'OK: production index (no /src/main.tsx)'
