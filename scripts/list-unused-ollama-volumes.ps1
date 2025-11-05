[CmdletBinding()]param()
$ErrorActionPreference = 'Stop'

function Test-VolumeInUse {
  param([string]$Name)
  $users = docker ps -a --filter "volume=$Name" --format '{{.Names}}'
  return [bool]$users
}
function Show-VolumePreview {
  param([string]$Name)
  Write-Host "---- $v (preview) ----" -ForegroundColor Cyan
  $cmd = @(
    'apk add --no-cache coreutils >/dev/null 2>&1 || true'
    'echo "# tree /root/.ollama (depth 2)"'
    'find /root/.ollama -maxdepth 2 -type d -print 2>/dev/null | sed "s|^|  |"'
    'echo "# sizes (du -sh)"'
    'du -sh /root/.ollama 2>/dev/null || true'
    'du -sh /root/.ollama/models 2>/dev/null || true'
  ) -join '; '
  docker run --rm -v "${Name}:/root/.ollama" alpine sh -lc "$cmd" | Write-Host
}

$vols = docker volume ls --format '{{.Name}}' | Select-String -Pattern 'ollama' | ForEach-Object { $_.ToString().Trim() }
if(-not $vols){ Write-Host 'No ollama volumes found.' -ForegroundColor Yellow; exit 0 }

$unused = @()
foreach($v in $vols){
  if(Test-VolumeInUse -Name $v){
    "{0,-45} {1}" -f $v,'IN-USE'
  } else {
    "{0,-45} {1}" -f $v,'<unused>'
    $unused += $v
  }
}

if($unused.Count -gt 0){
  Write-Host "`nUNUSED VOLUMES (review before removal):" -ForegroundColor Yellow
  $unused | ForEach-Object { Write-Host "  $_" }
  Write-Host "`nPreviews:" -ForegroundColor Yellow
  foreach($v in $unused){ Show-VolumePreview -Name $v }
  Write-Host "`nDelete one with:" -ForegroundColor Yellow
  Write-Host '  docker volume rm <name>' -ForegroundColor Yellow
} else {
  Write-Host "`nNo unused ollama volumes detected." -ForegroundColor Green
}
