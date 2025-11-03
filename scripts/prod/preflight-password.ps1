<#
.SYNOPSIS
  Align Postgres role password (myuser) with current $env:POSTGRES_PASSWORD before backend starts.
.DESCRIPTION
  Non-destructive preflight used by deploy-prod.ps1. If Postgres is healthy but a test connection
  using the intended password fails, attempts an ALTER ROLE inside the postgres container.
  Falls back gracefully if postgres not yet up (returns neutral code 0 so deploy can proceed to wait logic).

.EXIT CODES
  0 success / already aligned / not yet applicable
  2 alignment performed successfully
  10 postgres unreachable (skipped)
  20 POSTGRES_PASSWORD missing
  30 alignment attempted but failed

.PARAMETER ComposeFiles
  One or more compose files (default: docker-compose.prod.yml + optional override) used for docker compose calls.
.PARAMETER Project
  Compose project name (if you pin one externally; default is derived by docker compose).
.PARAMETER DryRun
  Do not execute ALTER; only report what would happen.
.PARAMETER Verbose
  Extra diagnostic output.

.NOTES
  Requires docker CLI and psql client inside postgres container (standard image provides it).
#>
[CmdletBinding()]
param(
  [string[]]$ComposeFiles = @('docker-compose.prod.yml','docker-compose.prod.override.yml'),
  [string]$Project,
  [switch]$DryRun
)

function Write-Log {
  param([string]$Msg,[string]$Level='INFO')
  $ts = (Get-Date).ToString('s')
  Write-Host "[$ts] [preflight] [$Level] $Msg"
}

if (-not $env:POSTGRES_PASSWORD) {
  if($DryRun){
    Write-Log 'POSTGRES_PASSWORD not set (dry-run) – treating as aligned noop' 'WARN'
    exit 0
  }
  Write-Log 'POSTGRES_PASSWORD not set in environment; cannot align' 'ERROR'
  exit 20
}

$composeArgs = @()
foreach($f in $ComposeFiles){ if(Test-Path $f){ $composeArgs += @('-f', $f) } }
if($Project){ $composeArgs += @('-p', $Project) }

# Quick health probe: is postgres container running & healthy?
try {
  $inspect = docker compose @composeArgs ps --format json 2>$null | ConvertFrom-Json
} catch { $inspect = @() }
$post = $inspect | Where-Object { $_.Service -eq 'postgres' }
if(-not $post){
  Write-Log 'postgres service not found (yet) – skipping alignment' 'WARN'
  exit 10
}

# Try pg_isready inside container (cheap readiness)
docker compose @composeArgs exec -T postgres pg_isready -U myuser 2>$null
if($LASTEXITCODE -ne 0){
  Write-Log 'postgres not accepting connections yet – skip' 'WARN'
  exit 10
}

# Attempt a test connection using intended password.
$testSql = 'SELECT 1;' ; $pw = $env:POSTGRES_PASSWORD
$cmd = "psql -v ON_ERROR_STOP=1 -U myuser -d finance -c '$testSql'"
# env block not needed; pass via -e
# run inside container with supplied password env
docker compose @composeArgs exec -T -e PGPASSWORD=$pw postgres bash -lc $cmd 2>&1 | Out-Null
$ok = $LASTEXITCODE -eq 0
if($ok){
  Write-Log 'Password already valid; no alignment needed'
  exit 0
}

Write-Log 'Password test failed → will attempt ALTER ROLE'
$alter = "ALTER ROLE myuser WITH PASSWORD '" + ($pw -replace "'","''") + "';"
if($DryRun){
  Write-Log "DRY-RUN: Would execute: $alter" 'INFO'
  exit 0
}
docker compose @composeArgs exec -T postgres psql -v ON_ERROR_STOP=1 -U myuser -d postgres -c "$alter" 2>&1 | Tee-Object -Variable alterOut | Out-Null
if($LASTEXITCODE -ne 0){
  Write-Log "ALTER ROLE failed: $alterOut" 'ERROR'
  exit 30
}
Write-Log 'Password aligned successfully' 'INFO'
# Re-test
docker compose @composeArgs exec -T -e PGPASSWORD=$pw postgres bash -lc $cmd 2>&1 | Out-Null
if($LASTEXITCODE -eq 0){
  Write-Log 'Post-alignment test succeeded' 'INFO'
  exit 2
}
Write-Log 'Post-alignment test still failing (unexpected)' 'ERROR'
exit 30
