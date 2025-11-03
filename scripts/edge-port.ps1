param(
  [string]$EdgeHost = '127.0.0.1',
  [int[]]$CandidatePorts = @(80,8080),
  [switch]$VerboseWarn,
  [switch]$FailOnMulti
)

function Test-MetricsAlias {
  param([int]$p)
  $url = "http://${EdgeHost}:$p/api/metrics"
  $h = & curl.exe -sI $url
  if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($h)) {
    return @{ ok = $false; why = 'curl_failed'; raw = $h }
  }
  $is307 = $h -match 'HTTP/1\.1 307'
  $loc = $h -match '(?im)^\s*Location:\s*/metrics'
  return @{ ok = ($is307 -and $loc); status307 = $is307; hasLoc = $loc; raw = $h }
}

function Test-IsLedgerMindIndex {
  param([int]$p)
  $url = "http://${EdgeHost}:$p/"
  $b = & curl.exe -s $url
  if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($b)) { return $false }
  if ($b -match 'LedgerMind') { return $true }
  if ($b -match '/assets/[^"'']+\.js') { return $true }
  return $false
}

# Warn if multiple nginx containers are running (easy to miss)
$names = (docker ps --format '{{.Names}}') 2>$null
$nginxNames = @()
if ($names) { $nginxNames = $names | Where-Object { $_ -match 'nginx' } }
if ($VerboseWarn -and $nginxNames.Count -gt 1) {
  Write-Host ("WARNING: multiple nginx containers running: {0}" -f ($nginxNames -join ', ')) -ForegroundColor Yellow
}
if ($FailOnMulti -and $nginxNames.Count -gt 1) {
  Write-Error ("Multiple nginx containers detected: {0}" -f ($nginxNames -join ', '))
  exit 2
}

# Strategy 1: pick first port where metrics alias works
$selected = $null
foreach ($p in $CandidatePorts) {
  $res = Test-MetricsAlias -p $p
  if ($res.ok) { $selected = $p; break }
}

# Strategy 2: fallback to index signature
if (-not $selected) {
  foreach ($p in $CandidatePorts) {
    if (Test-IsLedgerMindIndex -p $p) { $selected = $p; break }
  }
}

if (-not $selected) {
  Write-Error ("No candidate port served the LedgerMind edge (checked: {0})." -f ($CandidatePorts -join ', '))
  exit 1
}

Write-Output $selected
if ($env:GITHUB_OUTPUT) { "edge_port=$selected" | Out-File -FilePath $env:GITHUB_OUTPUT -Append -Encoding utf8 }
exit 0
