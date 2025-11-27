param([string]$Path=".env")

if (-not (Test-Path $Path)) { Write-Error "File not found: $Path"; exit 1 }

# Collect non-comment, non-empty lines
$lines = Get-Content -Raw -Encoding UTF8 $Path -ErrorAction Stop -EA Stop | Select-String -Pattern '.*' -AllMatches | ForEach-Object { $_.Line }
$active = $lines | Where-Object { $_.Trim() -ne '' -and -not ($_.Trim().StartsWith('#')) }

# Detect invalid lines (no NAME=VALUE or bad name)
$bad = @()
foreach ($l in $active) {
  if ($l -notmatch '^[A-Za-z_][A-Za-z0-9_]*=') { $bad += $l }
  if ($l -match '\s') { # embedded whitespace (likely wrapped line)
    $bad += $l
  }
}
$bad = $bad | Sort-Object -Unique
if ($bad.Count -gt 0) {
  Write-Error "Invalid env line(s):`n$($bad -join "`n")"; exit 1
}

# Required keys
$required = @('POSTGRES_PASSWORD','OPENAI_API_KEY')
$missing = @()
foreach ($k in $required) {
  if (-not ($active | Where-Object { $_ -match "^$k=" })) { $missing += $k }
}
if ($missing.Count -gt 0) {
  Write-Error "Missing required keys: $($missing -join ', ')"; exit 1
}

Write-Host "env looks good" -ForegroundColor Green
