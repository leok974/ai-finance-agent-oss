param(
  [switch]$ResetPg,                # wipe pgdata volume first (fresh DB)
  [switch]$NoLLM,                  # allow running without an LLM for now
  [switch]$Full,                   # start all services (nginx, agui, cloudflared, certbot/nginx-reloader if present)
  [int]$ReadyTimeoutSec = 90,      # how long to wait for /api/status ok+migrations.ok
  [string]$BaseUrl = "http://127.0.0.1",  # default to local reverse proxy (pass prod URL explicitly when needed)
  [switch]$SmokeAuth,              # run authenticated smoke after readiness
  [switch]$Json,                   # emit machine-readable JSON summary
  [switch]$AutoMigrate,            # auto-run alembic upgrade head on drift
  [switch]$Local,                  # convenience: force BaseUrl=http://127.0.0.1
  [switch]$RequireCrypto           # gate readiness on crypto.ok too
  ,[switch]$BackendOnly            # start only postgres+backend; skip edge services
  ,[switch]$InternalProbe          # probe internal container endpoints instead of external BaseUrl
)

$ErrorActionPreference = "Stop"
$FILES = @('-f','docker-compose.prod.yml','-f','docker-compose.prod.override.yml')
$EnvFile = ".env.prod.local"

if ($Local) { $BaseUrl = 'http://127.0.0.1' }

function New-Rand {
  param([int]$len = 32)
  $bytes = New-Object byte[] $len
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  [Convert]::ToBase64String($bytes)
}

function Export-EnvFile([string]$path) {
  Get-Content $path | ForEach-Object {
    if ($_ -match '^\s*#' -or $_ -match '^\s*$') { return }
    $k,$v = $_.Split('=',2)
    if ($k) { try { setx $k $v | Out-Null } catch { }; Set-Item -Path Env:$k -Value $v }
  }
}

function Wait-Status([string]$url, [int]$timeoutSec) {
  $deadline = (Get-Date).AddSeconds($timeoutSec)
  $last = $null
  do {
    try {
      $last = Invoke-RestMethod -Uri ($url + "/api/status") -TimeoutSec 6 -ErrorAction Stop
      # Core readiness ignores crypto (and possibly llm) unless -RequireCrypto was requested.
      $coreOk = $last.db.ok -and $last.migrations.ok
      $overallOk = if ($RequireCrypto) { $coreOk -and $last.crypto.ok } else { $coreOk }
      if ($overallOk) {
        Write-Host ("Ready: core={0} require_crypto={1} crypto={2} t={3}ms" -f $coreOk, [bool]$RequireCrypto, $last.crypto.ok, $last.t_ms) -ForegroundColor Green
        return $last
      }
      Write-Host ("Waiting: core={0} db={1} mig={2} crypto={3} (curr={4} head={5})" -f `
        $coreOk, $last.db.ok, $last.migrations.ok, $last.crypto.ok, $last.migrations.current, $last.migrations.head) -ForegroundColor Yellow
    } catch {
      Write-Host ("Waiting: /api/status unreachable ({0})" -f $_.Exception.Message) -ForegroundColor DarkYellow
    }
    Start-Sleep 3
  } while ((Get-Date) -lt $deadline)

  Write-Host "Timed out waiting for /api/status to be ready." -ForegroundColor Red
  if ($last) { $last | ConvertTo-Json -Depth 6 | Write-Output }
  return $null
}

function Invoke-InternalProbe {
  param([ValidateSet('backend','nginx')] [string]$Mode = 'backend')
  $cmd = if ($Mode -eq 'backend') {
    @('exec','backend','python','- <<"PY"','import json,urllib.request,sys;\n' +
      'url="http://127.0.0.1:8000/status"\n' +
      'try:\n' +
      '  with urllib.request.urlopen(url,timeout=4) as r:\n' +
      '    sys.stdout.write(r.read().decode())\n' +
      'except Exception as e:\n' +
      '  sys.stderr.write(str(e))\n','PY')
  } else {
    @('exec','nginx','sh','-lc','apk add --no-cache curl >/dev/null 2>&1 || true; curl -fsS --max-time 4 http://127.0.0.1/api/status | sed -n "1,160p"')
  }
  $FILES = @('-f','docker-compose.prod.yml','-f','docker-compose.prod.override.yml')
  try {
    $raw = docker --context desktop-linux compose $FILES @cmd 2>$null
    return $raw
  } catch {
    return $null
  }
}

function Write-Json([hashtable]$obj) {
  $obj | ConvertTo-Json -Depth 8
}

# 1) Prepare env values (reuse if file exists)
# NOTE: your compose uses POSTGRES_USER=myuser — we keep that consistent.
$POSTGRES_PASSWORD = $env:POSTGRES_PASSWORD
$MASTER_KEK_B64    = $env:MASTER_KEK_B64
$OPENAI_API_KEY    = $env:OPENAI_API_KEY

if (-not (Test-Path $EnvFile)) {
  if (-not $POSTGRES_PASSWORD) { $POSTGRES_PASSWORD = [Guid]::NewGuid().ToString("N") + "!PgA1" }
  if (-not $MASTER_KEK_B64)    { $MASTER_KEK_B64    = New-Rand 32 }
  if (-not $OPENAI_API_KEY)    { $OPENAI_API_KEY    = "" } # optional

  @"
# Generated $(Get-Date -Format s)
# Keep POSTGRES_USER consistent with compose (myuser)
POSTGRES_PASSWORD=$POSTGRES_PASSWORD
MASTER_KEK_B64=$MASTER_KEK_B64
OPENAI_API_KEY=$OPENAI_API_KEY
BACKEND_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>$null)
BACKEND_COMMIT=$(git rev-parse --short HEAD 2>$null)
DEV_ALLOW_NO_LLM=$([string]::IsNullOrEmpty($OPENAI_API_KEY) -or $NoLLM)
NGINX_CONTAINER=ai-finance-agent-oss-clean-nginx-1
# Uncomment to disable encryption locally for green status without keys:
# ENCRYPTION_ENABLED=0
"@ | Set-Content -Encoding UTF8 $EnvFile
  Write-Host "Wrote $EnvFile" -ForegroundColor Green
} else {
  Write-Host "$EnvFile already exists; using its values." -ForegroundColor Yellow
  # Ensure NGINX_CONTAINER present
  if (-not (Select-String -Path $EnvFile -Pattern '^NGINX_CONTAINER=' -Quiet)) {
    Add-Content -Path $EnvFile -Value 'NGINX_CONTAINER=ai-finance-agent-oss-clean-nginx-1'
    Write-Host "Appended NGINX_CONTAINER to $EnvFile" -ForegroundColor Cyan
  }
}

# Always (re)write a minimal clean .env (compose auto-load) with only the vars we interpolate in compose files.
try {
  $envVars = @()
  foreach ($line in (Get-Content $EnvFile)) {
    if ($line -match '^(POSTGRES_PASSWORD|MASTER_KEK_B64|OPENAI_API_KEY|DEV_ALLOW_NO_LLM|NGINX_CONTAINER)=') { $envVars += $line }
  }
  ($envVars + '') | Set-Content -NoNewline:$false -Encoding UTF8 .env
  Write-Host "Wrote fresh .env for compose interpolation (vars: $($envVars.Count))" -ForegroundColor Green
} catch {
  Write-Warning "Failed to write clean .env: $($_.Exception.Message)"
}

# 2) Export envs for this shell
Export-EnvFile $EnvFile
Write-Host "Exported envs: POSTGRES_PASSWORD, MASTER_KEK_B64, OPENAI_API_KEY, DEV_ALLOW_NO_LLM" -ForegroundColor Cyan

function Invoke-EnvDoctor {
  $crit = @('POSTGRES_PASSWORD')
  $opt  = @('OPENAI_API_KEY','MASTER_KEK_B64','ENCRYPTION_ENABLED','ENCRYPTION_MODE','GCP_KMS_KEY')
  foreach ($k in $crit) { if (-not $env:$k) { Write-Warning "Missing critical env: $k" } }
  foreach ($k in $opt)  { if (-not $env:$k) { Write-Host "Note: $k is empty" -ForegroundColor DarkYellow } }
}
Invoke-EnvDoctor

# 3) Optional: reset Postgres volume
if ($ResetPg) {
  Write-Host "Stopping stack & removing pgdata volume..." -ForegroundColor Yellow
  docker --context desktop-linux compose $FILES down
  docker --context desktop-linux volume rm ai-finance-agent-oss-clean_pgdata 2>$null | Out-Null
}

# 4) Start services
docker --context desktop-linux compose $FILES up -d postgres
docker --context desktop-linux compose $FILES up -d --build backend

# Auto-start nginx when -Local and not explicitly limited
if ($Local -and -not $BackendOnly -and -not $Full) {
  Write-Host "Local mode: starting nginx (implicit). Use -BackendOnly to skip." -ForegroundColor Yellow
  try { docker --context desktop-linux compose $FILES up -d nginx | Out-Null } catch { }
}

if ($Full -and -not $BackendOnly) {
  $more = @("nginx","agui","cloudflared","certbot","nginx-reloader")
  foreach ($svc in $more) { try { docker --context desktop-linux compose $FILES up -d $svc | Out-Null } catch { } }
}

# 5) Brief backend logs
Start-Sleep 2
docker --context desktop-linux compose $FILES logs --tail=80 backend

Write-Host "`nIf you see [STARTUP] DB connectivity OK, proceeding to readiness probe..." -ForegroundColor Green

# 6) Readiness logic
if ($BackendOnly -or $InternalProbe) {
  Write-Host "Probing backend internally (container exec) ..." -ForegroundColor Cyan
  $raw = Invoke-InternalProbe -Mode 'backend'
  if ($raw) {
    try {
      # Some distroless outputs might include preface lines; extract first JSON object
      $jsonLine = ($raw -split "`n") | Where-Object { $_ -match '^\s*\{' } | Select-Object -First 1
      if ($jsonLine) { $st = $jsonLine | ConvertFrom-Json } else { Write-Warning "No JSON line found in internal probe output" }
    } catch { Write-Warning "Failed to parse internal probe JSON snippet: $jsonLine" }
  } else {
    Write-Warning "Internal probe returned no data"; $st = $null
  }
} else {
  # External (possibly nginx) path
  $st = Wait-Status -url $BaseUrl -timeoutSec $ReadyTimeoutSec
}

if (-not $st -and $Json) {
  Write-Json @{ ok=$false; reason="timeout"; url=$BaseUrl }
  exit 1
}

# 7) Migration drift handling
$drift = $false
if ($st -and -not $st.migrations.ok) {
  $drift = $true
  Write-Warning ("Migration drift: current={0} head={1}" -f $st.migrations.current, $st.migrations.head)
  if ($AutoMigrate) {
    Write-Host "Running 'alembic upgrade head'..." -ForegroundColor Yellow
    docker --context desktop-linux compose $FILES exec backend alembic upgrade head
    try {
      $st = Invoke-RestMethod -Uri ($BaseUrl + "/api/status") -TimeoutSec 10
      if (-not $st.migrations.ok) {
        Write-Host "Migrations still not at head." -ForegroundColor Red
      } else {
        Write-Host "Migrations upgraded to head." -ForegroundColor Green
        $drift = $false
      }
    } catch {
      Write-Host "Status fetch failed after AutoMigrate: $($_.Exception.Message)" -ForegroundColor Red
    }
  } else {
    Write-Host "Run: docker --context desktop-linux compose $($FILES -join ' ') exec backend alembic upgrade head" -ForegroundColor Yellow
  }
}

# 8) Optional authenticated smoke
if ($SmokeAuth -and (Test-Path .\scripts\smoke-prod.ps1)) {
  pwsh .\scripts\smoke-prod.ps1 -BaseUrl $BaseUrl
}

# 9) Final summarized output
# Compute core/overall readiness (independent of original $st.ok semantics which may include crypto)
$readyCore = [bool]($st -and $st.db.ok -and $st.migrations.ok)
$readyAll  = if ($RequireCrypto) { $readyCore -and ($st.crypto.ok) } else { $readyCore }
$summary = @{
  ok        = $readyAll
  db_ok     = if ($st) { $st.db.ok } else { $false }
  mig_ok    = if ($st) { $st.migrations.ok } else { $false }
  mig_cur   = if ($st) { $st.migrations.current } else { $null }
  mig_head  = if ($st) { $st.migrations.head } else { $null }
  crypto_ok = if ($st) { $st.crypto.ok } else { $false }
  llm_ok    = if ($st) { $st.llm.ok } else { $false }
  t_ms      = if ($st) { $st.t_ms } else { -1 }
  drift     = $drift
  url       = $BaseUrl
  gated     = @{ core = $readyCore; require_crypto = [bool]$RequireCrypto }
}

if ($Json) {
  # Recompute gated logic before printing JSON (kept here for clarity)
  $readyCore = [bool]($st -and $st.ok -and $st.db.ok -and $st.migrations.ok)
  $readyAll  = if ($RequireCrypto) { $readyCore -and $summary.crypto_ok } else { $readyCore }
  $summary.ok = $readyAll
  $summary.gated = @{ core = $readyCore; require_crypto = [bool]$RequireCrypto }
  Write-Json $summary
} else {
  # Apply gating logic for human-readable summary
  $readyCore = [bool]($st -and $st.ok -and $st.db.ok -and $st.migrations.ok)
  $readyAll  = if ($RequireCrypto) { $readyCore -and $summary.crypto_ok } else { $readyCore }
  $summary.ok = $readyAll
  $summary.gated = @{ core = $readyCore; require_crypto = [bool]$RequireCrypto }
  $color = if ($readyAll) { 'Green' } else { 'Red' }
  Write-Host ("SUMMARY | ok={0} (core={1}, crypto_req={2}) db={3} mig={4} crypto={5} llm={6} t={7}ms url={8}" -f `
    $summary.ok, $readyCore, $RequireCrypto, $summary.db_ok, $summary.mig_ok, $summary.crypto_ok, $summary.llm_ok, $summary.t_ms, $summary.url) -ForegroundColor $color
}

# 10) Public smoke (non-auth) epilogue (skip if already run with auth to avoid duplication? keep anyway)
if (Test-Path .\scripts\smoke-prod.ps1) {
  pwsh .\scripts\smoke-prod.ps1 -BaseUrl $BaseUrl -SkipAuth
} else {
  Write-Host "Tip: add scripts/smoke-prod.ps1 for richer checks." -ForegroundColor Yellow
}

<#
Examples

# Fresh DB, no LLM yet, start everything, wait up to 2 minutes
pwsh .\scripts\prod-bootstrap.ps1 -ResetPg -NoLLM -Full -ReadyTimeoutSec 120

# Reuse DB, only start postgres+backend, default timeout
pwsh .\scripts\prod-bootstrap.ps1

Notes
  - POSTGRES_USER is 'myuser' per compose file.
  - Readiness waits for /api/status overall ok + db.ok + migrations.ok.
  - Use -Full to also start nginx, agui, cloudflared, certbot, nginx-reloader.
  - Use -ResetPg to forcibly reinitialize the database volume.
  - -NoLLM sets DEV_ALLOW_NO_LLM if no key present.
  - -SmokeAuth runs full auth smoke (interactive password prompt).
  - -Json outputs machine-readable summary (CI friendly).
  - -AutoMigrate attempts 'alembic upgrade head' automatically on drift.
#>
