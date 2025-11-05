<#!
.SYNOPSIS
  Rebuild and (re)deploy the production stack (images + containers) using docker compose prod files.

.DESCRIPTION
  Convenience orchestration around docker compose for the prod stack defined in:
    - docker-compose.prod.yml
    - docker-compose.prod.override.yml (optional hardening / local overrides)

  Steps (default):
    1. Compute build args (GIT branch/commit/time) if not provided.
    2. docker compose build (optionally --no-cache / --pull) backend web nginx agui.
    3. docker compose up -d (includes postgres, ollama, certbot, nginx, etc.).
    4. Wait for critical healthchecks (postgres -> backend -> web -> nginx).
    5. Show concise status + version metadata (nginx baked file, backend labels).

  Optional flags allow skipping build, migrations, pruning old images, or launching only core services.

.PARAMETER NoCache
  Use --no-cache for docker compose build.

.PARAMETER Pull
  Add --pull to force pulling newer base images.

.PARAMETER StackOnly
  Skip build; just (re)create and start services (compose up -d).

.PARAMETER Prune
  After successful deploy, prune dangling images (docker image prune -f).

.PARAMETER Services
  Comma-separated subset of services to build (default: backend,web,nginx,agui).

.EXAMPLE
  ./scripts/rebuild-prod.ps1 -NoCache -Pull -Prune

.EXAMPLE
  ./scripts/rebuild-prod.ps1 -StackOnly
#>
[CmdletBinding()]param(
  [switch]$NoCache,
  [switch]$Pull,
  [switch]$StackOnly,
  [switch]$Prune,
  [switch]$PurgeEdge,
  [switch]$PurgeEdgeQuick,     # targeted Cloudflare purge of critical URLs
  [switch]$PurgeEdgeAll,       # purge entire Cloudflare zone (prompts unless forced)
  [switch]$PurgeEdgeAllForce,  # with -PurgeEdgeAll: skip confirmation
  [string]$Services = 'backend,nginx,agui'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Write-Step($msg){ Write-Host "`n=== $msg ===" -ForegroundColor Cyan }
function Write-Warn($msg){ Write-Host "[warn] $msg" -ForegroundColor Yellow }
function Fail($msg){ Write-Host "[error] $msg" -ForegroundColor Red; exit 1 }

$repoRoot = Split-Path -Parent $PSScriptRoot
Push-Location $repoRoot
try {
  $composeFiles = @('-f','docker-compose.prod.yml','-f','docker-compose.prod.override.yml')
  if (-not (Test-Path 'docker-compose.prod.override.yml')) { $composeFiles = @('-f','docker-compose.prod.yml') }

  $gitCommit = $env:GIT_COMMIT
  if (-not $gitCommit) { $gitCommit = (git rev-parse --short HEAD 2>$null) }
  if (-not $gitCommit) { $gitCommit = 'unknown' }
  $gitBranch = $env:GIT_BRANCH
  if (-not $gitBranch) { $gitBranch = (git rev-parse --abbrev-ref HEAD 2>$null) }
  if (-not $gitBranch) { $gitBranch = 'unknown' }
  $buildTime = (Get-Date).ToUniversalTime().ToString('s') + 'Z'

  $env:GIT_COMMIT = $gitCommit
  $env:GIT_BRANCH = $gitBranch
  $env:BUILD_TIME = $buildTime

  # 1. Build images (unless StackOnly)
  if (-not $StackOnly) {
    Write-Step "Building images ($Services)";
    $svcList = $Services.Split(',') | ForEach-Object { $_.Trim() } | Where-Object { $_ }
    $buildArgs = @('compose') + $composeFiles + @('build')
    if ($NoCache) { $buildArgs += '--no-cache' }
    if ($Pull)    { $buildArgs += '--pull' }
    $buildArgs += $svcList
    Write-Host "docker $($buildArgs -join ' ')" -ForegroundColor DarkGray
    docker @buildArgs
  } else {
    Write-Step 'Skipping build (StackOnly)'
  }

  # 2. Bring stack up
  Write-Step 'Starting stack'
  docker compose @composeFiles up -d

  # 3. Health wait sequence
  $waitList = @(
    @{ Name='postgres'; Test={ docker compose @composeFiles ps --status=running | Select-String -Quiet 'postgres' } ; Timeout=180 }
    @{ Name='backend';  Test={ docker compose @composeFiles ps --status=running | Select-String -Quiet 'backend' } ; Timeout=240 }
    @{ Name='nginx';    Test={ docker compose @composeFiles ps --status=running | Select-String -Quiet 'nginx' } ; Timeout=120 }
  )
  for ($i = 0; $i -lt $waitList.Count; $i++) {
    $w = $waitList[$i]
    Write-Step "Waiting for $($w.Name) (timeout $($w.Timeout)s)"
    $start = Get-Date
    while ($true) {
      if (& $w.Test) { Write-Host "$($w.Name) running" -ForegroundColor Green; break }
      if ((Get-Date) - $start -gt [TimeSpan]::FromSeconds($w.Timeout)) { Fail "$($w.Name) failed to become healthy in time" }
      Start-Sleep -Seconds 5
    }
  }

  # 4. Summaries
  Write-Step 'Container status'
  docker compose @composeFiles ps

  Write-Step 'Backend image labels'
  $backendImg = docker compose @composeFiles config | Select-String -Pattern 'image:.*backend' | Select-Object -First 1 | ForEach-Object { ($_ -split ':\s*')[1] }
  if ($backendImg) {
    docker image inspect $backendImg --format '{{json .Config.Labels}}' 2>$null | Write-Host
  }

  Write-Step 'Edge version.json'
  try { docker compose @composeFiles exec -T nginx cat /usr/share/nginx/html/version.json 2>$null } catch { Write-Warn 'Could not read version.json' }

  if ($Prune) {
    Write-Step 'Pruning dangling images'
    docker image prune -f | Out-Host
  }

  if ($PurgeEdge) {
    Write-Step 'Cloudflare purge (changed-only)'
    if (-not $env:CLOUDFLARE_API_TOKEN -or -not $env:CLOUDFLARE_ZONE_ID) {
      Write-Warn 'Skipping purge: CLOUDFLARE_API_TOKEN / CLOUDFLARE_ZONE_ID not set'
    } else {
      try {
        node scripts/cf-purge.js --base=https://app.ledger-mind.org --dist=apps/web/dist --onlyIfChanged=1
      }
      catch {
        Write-Warn "Purge failed: $($_.Exception.Message)"
      }
    }
  }

  if ($PurgeEdgeQuick) {
    Write-Step 'Cloudflare purge (quick targeted)'
    if (-not $env:CLOUDFLARE_ZONE_ID -or (-not $env:CLOUDFLARE_API_TOKEN -and (-not $env:CLOUDFLARE_GLOBAL_KEY -or -not $env:CLOUDFLARE_EMAIL))) {
      Write-Warn 'Skipping quick purge: set CLOUDFLARE_ZONE_ID and CLOUDFLARE_API_TOKEN (or CLOUDFLARE_GLOBAL_KEY + CLOUDFLARE_EMAIL)'
    } else {
      try {
        & (Join-Path $PSScriptRoot 'purge-cf-quick.ps1') | Out-Host
      } catch {
        Write-Warn "Quick purge failed: $($_.Exception.Message)"
      }
    }
  }

  if ($PurgeEdgeAll) {
    Write-Step 'Cloudflare purge (ENTIRE zone)'
    if (-not $env:CLOUDFLARE_ZONE_ID -or (-not $env:CLOUDFLARE_API_TOKEN -and (-not $env:CLOUDFLARE_GLOBAL_KEY -or -not $env:CLOUDFLARE_EMAIL))) {
      Write-Warn 'Skipping full purge: set CLOUDFLARE_ZONE_ID and CLOUDFLARE_API_TOKEN (or CLOUDFLARE_GLOBAL_KEY + CLOUDFLARE_EMAIL)'
    } else {
      try {
        $args = @('-Everything')
        if ($PurgeEdgeAllForce) { $args += '-Force' }
        & (Join-Path $PSScriptRoot 'purge-cf-quick.ps1') @args | Out-Host
      } catch {
        Write-Warn "Full purge failed: $($_.Exception.Message)"
      }
    }
  }

  Write-Step 'Done'
  Write-Host "Branch: $gitBranch  Commit: $gitCommit  Built: $buildTime" -ForegroundColor Green
}
finally { Pop-Location }
