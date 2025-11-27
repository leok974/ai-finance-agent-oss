[CmdletBinding()]param(
  [string[]]$Ports = @('80','443','11434'),
  [string]$ExpectedProject = 'ai-finance-agent-oss-clean',
  [switch]$Json,
  [switch]$FailOnConflict
)
$ErrorActionPreference='Stop'
function W($t,$c='Cyan'){ if(-not $Json){ Write-Host $t -ForegroundColor $c } }
$rows = @()
$raw = docker ps --format '{{.ID}}|{{.Names}}|{{.Ports}}' 2>$null
foreach($line in $raw){
  if(-not $line){ continue }
  $parts = $line -split '\|'
  if($parts.Count -lt 3){ continue }
  $id,$name,$portsStr = $parts
  foreach($p in $Ports){
    if($portsStr -match "(?i)(0\.0\.0\.0|127\.0\.0\.1):$p->"){
      $rows += [pscustomobject]@{Port=$p;Container=$name;Ports=$portsStr;ProjectGuess=($name -split '-')[0];Id=$id}
    }
  }
}
$conflicts = $rows | Where-Object { $_.Container -notmatch $ExpectedProject }
$result = [ordered]@{ scanned=$rows.Count; conflicts=$conflicts; ok=($conflicts.Count -eq 0) }
if($Json){ $result | ConvertTo-Json -Depth 5; if($FailOnConflict -and -not $result.ok){ exit 2 }; return }
if($conflicts){
  W "Conflicts detected on critical ports:" 'Yellow'
  $conflicts | Format-Table -AutoSize
  if($FailOnConflict){ exit 2 }
} else { W 'No conflicts detected' 'Green' }
