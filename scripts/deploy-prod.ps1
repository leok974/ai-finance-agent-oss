[CmdletBinding()]param(
  [switch]$Build,
  [switch]$StrictTunnel,
  [int]$MinHaConnections = 1,
  [int]$TimeoutReadySec = 120,
  [int]$PollIntervalSec = 5,
  [string]$HostName = 'app.ledger-mind.org',
  [switch]$SkipEdgeVerify,
  [switch]$SkipReadyCheck,
  [switch]$EmitMetrics,
  [switch]$Generate,
  [switch]$SkipIndexGuard,
  [switch]$SkipPasswordAlign,
  [switch]$ShowConfig
)
<#
.SYNOPSIS
  Opinionated one-shot production stack deploy + health verification.
.DESCRIPTION
  Combines docker compose build/up, readiness polling, and edge verification with
  optional tunnel strict checks. Emits Prometheus edge metrics if requested.
.PARAMETER Build
  Force image rebuild before starting containers.
.PARAMETER StrictTunnel
  Fail deployment if tunnel metrics or DNS not healthy (uses edge-verify -TunnelStrict -MinHaConnections).
.PARAMETER MinHaConnections
  Minimum HA connections when using -StrictTunnel.
.PARAMETER TimeoutReadySec
  Total seconds to wait for internal /ready success.
.PARAMETER PollIntervalSec
  Interval seconds between readiness polls.
.PARAMETER HostName
  Public hostname to verify via edge.
.PARAMETER SkipEdgeVerify
  Skip external edge verification step.
.PARAMETER SkipReadyCheck
  Skip internal readiness polling (faster but less safe).
.PARAMETER EmitMetrics
  Write ops/metrics/edge.prom from edge-verify.
.PARAMETER Generate
  Include /api/generate lightweight ping (edge-verify -IncludeGenerate).
.PARAMETER ShowConfig
  Echo effective compose files & key env before starting.
.EXAMPLE
  pwsh ./scripts/deploy-prod.ps1 -Build -StrictTunnel -EmitMetrics
.EXAMPLE
  pwsh ./scripts/deploy-prod.ps1 -HostName staging.example.com -SkipEdgeVerify
#>
$ErrorActionPreference='Stop'

function Write-Info($m){ Write-Host "[info] $m" -ForegroundColor Cyan }
function Write-Ok($m){ Write-Host "[ok]   $m" -ForegroundColor Green }
function Write-Warn($m){ Write-Host "[warn] $m" -ForegroundColor Yellow }
function Write-Err($m){ Write-Host "[err]  $m" -ForegroundColor Red }

$composeFiles = @('-f','docker-compose.prod.yml','-f','docker-compose.prod.override.yml')
$edgeVerify = Join-Path $PSScriptRoot 'edge-verify.ps1'
$prodReady  = Join-Path $PSScriptRoot 'prod-ready.ps1'
$guardIndex = Join-Path $PSScriptRoot 'deploy' 'guard-index.ps1'
$preflightPw = Join-Path $PSScriptRoot 'prod' 'preflight-password.ps1'
if(-not (Test-Path $edgeVerify)){ Write-Err "Missing edge-verify.ps1"; exit 2 }
if(-not (Test-Path $prodReady)){ Write-Err "Missing prod-ready.ps1"; exit 2 }
if(-not (Test-Path $guardIndex)){ Write-Warn 'guard-index.ps1 not found (index guard skipped)'; $SkipIndexGuard=$true }
if(-not (Test-Path $preflightPw)){ Write-Warn 'preflight-password.ps1 not found (password alignment skipped)'; $SkipPasswordAlign=$true }

# Basic env introspection (do not print secrets)
$hasPg = [bool]$env:POSTGRES_PASSWORD
if($ShowConfig){
  Write-Info "Compose: $($composeFiles -join ' ')"
  Write-Info "POSTGRES_PASSWORD set: $hasPg"
  Write-Info "HostName: $HostName"
}
if(-not $hasPg){ Write-Warn 'POSTGRES_PASSWORD not set in environment (compose may fail auth if DB role differs).'
}

# 1. Build (optional)
if($Build){
  Write-Info 'Building images (docker compose build)' 
  docker compose $composeFiles build
  if($LASTEXITCODE -ne 0){ Write-Err 'Build failed'; exit 3 }
}

# 2. Start core services (postgres first so we can align)
Write-Info 'Starting stack (docker compose up -d)'
docker compose $composeFiles up -d postgres
if($LASTEXITCODE -ne 0){ Write-Err 'docker compose up postgres failed'; exit 4 }

# Optional password alignment (non-destructive)
if(-not $SkipPasswordAlign){
  Write-Info 'Running preflight password alignment'
  & pwsh $preflightPw -ComposeFiles @('docker-compose.prod.yml','docker-compose.prod.override.yml')
  $pwExit = $LASTEXITCODE
  switch($pwExit){
    0 { Write-Ok 'Password already aligned' }
    2 { Write-Ok 'Password aligned (role updated)' }
    10 { Write-Warn 'Postgres not ready yet for alignment (will rely on backend retry/migrations)' }
    20 { Write-Warn 'POSTGRES_PASSWORD missing – skipped alignment' }
    30 { Write-Err 'Password alignment failed'; exit 8 }
    default { Write-Warn "Unexpected preflight exit code: $pwExit (continuing)" }
  }
} else {
  Write-Warn 'Skipped password alignment'
}

# Bring up remaining services
docker compose $composeFiles up -d
if($LASTEXITCODE -ne 0){ Write-Err 'docker compose up (remaining services) failed'; exit 4 }

# 3. Internal readiness (poll backend through nginx container)
if(-not $SkipReadyCheck){
  Write-Info "Polling internal /ready (timeout ${TimeoutReadySec}s)"
  $deadline = (Get-Date).AddSeconds($TimeoutReadySec)
  $ok=$false
  while((Get-Date) -lt $deadline){
    $internal = docker compose $composeFiles exec -T nginx sh -lc "wget -q -O - http://backend:8000/ready" 2>$null
    if($LASTEXITCODE -eq 0 -and $internal -match '"ok":true'){ $ok=$true; break }
    Start-Sleep -Seconds $PollIntervalSec
  }
  if(-not $ok){ Write-Err 'Internal readiness failed before timeout'; exit 5 } else { Write-Ok 'Internal /ready OK' }
} else { Write-Warn 'Skipped internal readiness check' }

# 4. Edge verify (optional)
if(-not $SkipEdgeVerify){
  Write-Info 'Running edge verifier'
  $argsList = @('-HostName', $HostName, '-Json')
  if($EmitMetrics){ $argsList += '-EmitPromMetrics' }
  if($StrictTunnel){ $argsList += @('-TunnelStrict','-MinHaConnections', "$MinHaConnections") }
  if($Generate){ $argsList += '-IncludeGenerate' }
  $json = & pwsh $edgeVerify @argsList 2>$null
  if($LASTEXITCODE -ne 0){ Write-Err "edge-verify reported critical failures"; $json | Out-File edge-verify-fail.json; exit 6 }
  $json | Out-File edge-verify.json
  Write-Ok 'Edge verification passed'
  if($EmitMetrics){ Write-Info 'Metrics file: ops/metrics/edge.prom' }
} else { Write-Warn 'Skipped edge verification' }

# 5. Guard index (ensure production build served)
if(-not $SkipIndexGuard){
  Write-Info 'Running index guard'
  & pwsh $guardIndex -ComposeFiles @('docker-compose.prod.yml','docker-compose.prod.override.yml')
  if($LASTEXITCODE -ne 0){ Write-Err 'Index guard failed'; exit 7 }
  Write-Ok 'Index guard passed'
} else { Write-Warn 'Skipped index guard' }

# 6. Summary
Write-Ok 'Production stack deployed and verified'
Write-Info 'Next: tail logs with: docker compose -f docker-compose.prod.yml -f docker-compose.prod.override.yml logs -f nginx'
