param(
  [switch]$Down,
  [switch]$Rebuild,
  [string]$EnvFile = ".env.dev.local"
)

$ErrorActionPreference = "Stop"
$files = @('-f','docker-compose.dev.yml')
$proj  = @('-p','ledgermind-dev')

if ($Down) {
  docker compose $files $proj down
  exit $LASTEXITCODE
}

if (Test-Path $EnvFile) {
  Write-Host "Using $EnvFile" -ForegroundColor Cyan
} else {
  Write-Warning "No $EnvFile found (continuing; compose variables may be unset)"
}

# Auto-fallback to .env.dev template if local override missing
if (-not (Test-Path $EnvFile) -and (Test-Path '.env.dev')) {
  Write-Host "Falling back to .env.dev" -ForegroundColor Yellow
  $EnvFile = '.env.dev'
}

# Ensure POSTGRES_PASSWORD exported for compose variable interpolation if present in env file
try {
  if (-not $env:POSTGRES_PASSWORD) {
    $pwLine = Get-Content $EnvFile -ErrorAction SilentlyContinue | Select-String '^POSTGRES_PASSWORD='
    if ($pwLine) { $env:POSTGRES_PASSWORD = ($pwLine -split '=',2)[1].Trim() }
  }
} catch {
  Write-Warning ("Could not parse POSTGRES_PASSWORD from {0}: {1}" -f $EnvFile, $_)
}

$cmd = @('up','-d')
if ($Rebuild) { $cmd = @('up','-d','--build') }

# Fail-fast guard: if bringing up backend (explicitly or implicitly) ensure POSTGRES_PASSWORD is set
if ($cmd[0] -eq 'up') {
  # Detect whether user is targeting only specific services; if none specified compose will start all including backend
  $explicitServices = @()
  foreach ($arg in $args) { if ($arg -notmatch '^-') { $explicitServices += $arg } }
  $willStartBackend = $true
  if ($explicitServices.Count -gt 0 -and ($explicitServices -notcontains 'backend')) { $willStartBackend = $false }
  if ($willStartBackend -and -not $env:POSTGRES_PASSWORD) {
    Write-Error "POSTGRES_PASSWORD is not set. Export it (e.g. \`$env:POSTGRES_PASSWORD='changeme'\`) or add POSTGRES_PASSWORD=... to $EnvFile before starting backend." -ErrorAction Stop
  }
}

Write-Host "docker compose $($files -join ' ') $($proj -join ' ') --env-file $EnvFile $($cmd -join ' ')" -ForegroundColor DarkGray

docker compose $files $proj --env-file $EnvFile $cmd
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

docker compose $files $proj ps

# Detect backend restart loop due to password auth failures and emit remediation hint
try {
  $backendName = 'ledgermind-dev-backend-1'
  $inspect = docker ps --filter "name=$backendName" --format '{{.Status}}'
  if ($inspect -match 'Restarting') {
    # Fetch a short tail of logs to look for auth failure signature
    $log = docker logs $backendName 2>&1 | Select-String -Pattern 'password authentication failed' -SimpleMatch -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($log) {
      Write-Warning "Backend appears to be in a restart loop due to DB auth failures. Run: pwsh ./scripts/set-dev-password.ps1 -Generate -UpdateEnvFile -RestartBackend"
      if ($env:DEV_EXIT_ON_PW_LOOP -eq '1') { exit 42 }
    }
  }
} catch {
  # non-fatal
}
