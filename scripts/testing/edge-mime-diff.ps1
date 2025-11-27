<#!
.SYNOPSIS
  Compare origin vs edge headers for a single static asset and highlight MIME/cache mismatches.

.PARAMETER Asset
  Path to the asset beginning with /assets/ (e.g., /assets/index-AAAA.js)

.PARAMETER Base
  Public base URL (default https://app.ledger-mind.org)

.PARAMETER Context
  Docker compose context files (auto uses prod + override if present)

.EXAMPLE
  pwsh -File scripts/edge-mime-diff.ps1 -Asset /assets/index--ml_FyAe.js

#>
[CmdletBinding()]param(
  [Parameter(Mandatory=$true)][string]$Asset,
  [string]$Base = 'https://app.ledger-mind.org'
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ($Asset -notmatch '^/assets/.+') { throw "Asset must start with /assets/" }

$composeFiles = @('-f','docker-compose.prod.yml')
if (Test-Path 'docker-compose.prod.override.yml') { $composeFiles += @('-f','docker-compose.prod.override.yml') }

function Write-Section($t){ Write-Host "`n=== $t ===" -ForegroundColor Cyan }
function Line($k,$v){ Write-Host ("{0,-22} {1}" -f $k, $v) }
function Fail($m){ Write-Host "[FAIL] $m" -ForegroundColor Red; $script:FAIL=$true }
function Pass($m){ Write-Host "[PASS] $m" -ForegroundColor Green }

$ts = [int][double]::Parse((Get-Date -UFormat %s))

Write-Section 'Origin file existence'
$exists = docker compose @composeFiles exec nginx sh -lc "test -f /usr/share/nginx/html$Asset && echo OK || echo MISSING" 2>$null
Line 'origin_file' $exists
if ($exists -ne 'OK') { Fail 'Asset missing on origin; stale HTML likely'; exit 2 }

Write-Section 'Origin headers'
$originHeaders = docker compose @composeFiles exec nginx sh -lc "curl -sI http://localhost$Asset?__nocache=$ts | tr -d '\r'" 2>$null
$originCT = ($originHeaders -split "`n" | Where-Object { $_ -match '^Content-Type:' })
($originHeaders -split "`n") | Where-Object { $_ -match 'Content-Type|Cache-Control|ETag' } | ForEach-Object { Line 'origin_hdr' $_ }

Write-Section 'Edge headers'
$edgeHeaders = curl -skI "$Base$Asset?__nocache=$ts"
if (-not $edgeHeaders) { Fail 'Empty edge response (network or DNS issue)'; exit 2 }
$edgeCT = ($edgeHeaders -split "`n" | Where-Object { $_ -match '^Content-Type:' })
($edgeHeaders -split "`n") | Where-Object { $_ -match 'HTTP/|Content-Type|Cache-Control|CF-Cache-Status|ETag' } | ForEach-Object { Line 'edge_hdr' $_ }

Write-Section 'Analysis'
$expectedCT = 'application/javascript'
if ($originCT -notmatch $expectedCT) { Fail "Origin MIME not $expectedCT ($originCT)" } else { Pass "Origin MIME $originCT" }
if ($edgeCT -notmatch $expectedCT) { Fail "Edge MIME not $expectedCT ($edgeCT)" } else { Pass "Edge MIME $edgeCT" }

if ($originCT -match $expectedCT -and $edgeCT -notmatch $expectedCT) {
  Write-Host "Suggested Remediation:" -ForegroundColor Yellow
  Write-Host "  1. Cloudflare Cache Rule: path /assets/* -> Respect origin" -ForegroundColor Yellow
  Write-Host "  2. Purge specific asset or enable Development Mode then hard refresh" -ForegroundColor Yellow
  Write-Host "  3. (Optional) Temporary Transform Rule to force Content-Type: application/javascript" -ForegroundColor Yellow
}

if ($FAIL) { exit 2 } else { Write-Host "All checks OK" -ForegroundColor Green }
