[CmdletBinding()]param(
  [switch]$Aggressive
)
$ErrorActionPreference = 'Stop'
function Info($m,$c='Cyan'){ Write-Host $m -ForegroundColor $c }

Info '=== BEFORE ==='
docker system df -v

Info "`nStopping/removing exited containers..." 'Yellow'
docker container prune -f | Out-String | Write-Host

Info "`nRemoving unused networks..." 'Yellow'
docker network prune -f | Out-String | Write-Host

Info "`nRemoving unused images..." 'Yellow'
docker image prune -a -f | Out-String | Write-Host

if($Aggressive){
  Info "`nRemoving build cache..." 'Yellow'
  docker builder prune -f | Out-String | Write-Host
}

Info "`n=== AFTER ==="
docker system df -v
