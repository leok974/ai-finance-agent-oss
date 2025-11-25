# start-ledgermind.ps1
# Boot script for LedgerMind dev stack on Windows (PowerShell)

#region ---------- CONFIG (edit if paths/ports differ) ----------
$RepoRoot          = "C:\ai-finance-agent-oss-clean"
$ComposeFiles      = @("docker-compose.yml","docker-compose.dev.yml")  # order matters
$ProjectName       = "ai-finance-agent-oss-clean"

$BackendService    = "backend"
$BackendHealthUrl  = "http://127.0.0.1:8000/healthz"

$OllamaHealthUrl   = "http://127.0.0.1:11434/api/tags"

$WaitTimeoutSec    = 180   # overall wait per resource
$RemoveOrphans     = $true # cleans up renamed services
$RebuildWebOnBoot  = $false # set $true if you want web rebuilt each boot
$PullImages        = $false # set $true to `docker compose pull` on boot
#endregion -------------------------------------------------------

$ErrorActionPreference = "Stop"

function Write-Info($msg){ Write-Host "ℹ️  $msg" -ForegroundColor Cyan }
function Write-Ok($msg){ Write-Host "✅ $msg" -ForegroundColor Green }
function Write-Warn($msg){ Write-Host "⚠️  $msg" -ForegroundColor Yellow }
function Write-Err($msg){ Write-Host "❌ $msg" -ForegroundColor Red }

function Get-ComposeArgs() {
  $composeArgs = @()
  if ($ProjectName) { $composeArgs += @("-p", $ProjectName) }
  foreach ($f in $ComposeFiles) { $composeArgs += @("-f", $f) }
  return $composeArgs
}

function Wait-ForDocker() {
  $deadline = (Get-Date).AddSeconds($WaitTimeoutSec)
  while ((Get-Date) -lt $deadline) {
    try {
      docker info | Out-Null
      Write-Ok "Docker engine is ready."
      return
    } catch {
      Write-Info "Waiting for Docker..."
      Start-Sleep -Seconds 2
    }
  }
  throw "Docker engine did not become ready in $WaitTimeoutSec seconds."
}

function Invoke-Compose([string[]]$More) {
  $fullArgs = Get-ComposeArgs
  $fullArgs += $More
  & docker compose @fullArgs
}

function Get-ContainerId([string]$service) {
  Invoke-Compose @("ps","-q",$service) | Out-String | ForEach-Object { $_.Trim() }
}

function Wait-ContainerHealthy([string]$service) {
  $cid = Get-ContainerId $service
  if (-not $cid) { throw "Service '$service' has no container id." }
  $deadline = (Get-Date).AddSeconds($WaitTimeoutSec)
  while ((Get-Date) -lt $deadline) {
    $health = (& docker inspect -f '{{.State.Health.Status}}' $cid) 2>$null
    if ($health -eq "healthy") { Write-Ok "'$service' is healthy."; return }
    if ($health -eq "unhealthy") { throw "Service '$service' is unhealthy." }

    # Fallback for services without a healthcheck: consider 'running' as ready
    if (-not $health) {
      $state = (& docker inspect -f '{{.State.Status}}' $cid) 2>$null
      if ($state -eq "running") { Write-Ok "'$service' is running (no healthcheck)."; return }
    }

    $statusLabel = if ($health) { $health } else { "unknown" }
    Write-Info "'$service' health: $statusLabel …"
    Start-Sleep -Seconds 2
  }
  throw "Timeout waiting for '$service' to be healthy."
}

function Wait-UrlOk([string]$url) {
  $deadline = (Get-Date).AddSeconds($WaitTimeoutSec)
  while ((Get-Date) -lt $deadline) {
    try {
      $resp = Invoke-RestMethod -Uri $url -Method GET -TimeoutSec 5
      return $resp
    } catch { Start-Sleep -Milliseconds 800 }
  }
  throw "Timeout waiting for $url"
}

# --- RUN ---
try {
  Set-Location $RepoRoot

  Write-Info "Checking Docker…"
  Wait-ForDocker

  if ($PullImages) {
    Write-Info "Pulling images…"
    Invoke-Compose @("pull") | Out-Host
  }

  $upArgs = @("up","-d")
  if ($RemoveOrphans) { $upArgs += "--remove-orphans" }
  if ($RebuildWebOnBoot) { $upArgs += "--build" }

  Write-Info "Starting stack: $($ComposeFiles -join ', ') (project=$ProjectName)…"
  Invoke-Compose $upArgs | Out-Host

  # Optional: ensure Postgres first if you want strict ordering
  Write-Info "Waiting for Postgres…"
  try { Wait-ContainerHealthy "postgres" } catch { Write-Warn $_ }

  Write-Info "Waiting for backend…"
  Wait-ContainerHealthy $BackendService

  Write-Info "Probing backend healthz…"
  $hz = Wait-UrlOk $BackendHealthUrl
  Write-Ok  ("Backend /healthz OK. " + (ConvertTo-Json $hz -Compress))

  Write-Info "Checking Ollama…"
  try {
    $tags = Wait-UrlOk $OllamaHealthUrl
    $modelNames = ($tags.models | ForEach-Object { $_.name }) -join ', '
    Write-Ok ("Ollama OK. Models: " + $modelNames)
  } catch {
    Write-Warn "Could not reach Ollama at $OllamaHealthUrl (will continue)."
  }

  Write-Info "Crypto status (inside backend)…"
  try {
    Invoke-Compose @("exec","-T",$BackendService,"sh","-lc","python -m app.cli crypto-status") | Out-Host
  } catch {
    Write-Warn "crypto-status check failed (continuing)."
  }

  Write-Ok "LedgerMind stack is up. Web: http://127.0.0.1:5173  |  Backend: http://127.0.0.1:8000"
  Write-Info "Tip: docker compose $(Get-ComposeArgs -join ' ') logs -f $BackendService"
}
catch {
  Write-Err $_
  exit 1
}
