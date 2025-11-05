 [CmdletBinding(DefaultParameterSetName='Generate', SupportsShouldProcess=$true)]
 param(
   [Parameter(ParameterSetName='Secure', Mandatory=$true)]
   [SecureString]$Password,
   [Parameter(ParameterSetName='Plain', Mandatory=$true)]
   [string]$Plain,
   [Parameter(ParameterSetName='Generate', Mandatory=$true)]
   [switch]$Generate,
   [Parameter(ParameterSetName='Generate')]
   [int]$Length = 24,

   [switch]$RestartBackend,
   [string]$ComposeFile = "docker-compose.dev.yml",
   [string]$Project = "ledgermind-dev",
   [switch]$UpdateEnvFile,
   [string]$EnvFile = ".env.dev.local",
   [switch]$Show,
   [switch]$NoVerify,
   [string]$User = "myuser",
  [string]$DbHost = "postgres",
   [int]$Port = 5432,
   [int]$HealthTimeoutSec = 30,
   [int]$HealthIntervalSec = 2
 )

<###
 .SYNOPSIS
  Align (or set) the Postgres dev user password with your local env and optionally restart the backend.

 .DESCRIPTION
  Non-destructively updates the existing `myuser` role password inside the running dev Postgres container,
  exports POSTGRES_PASSWORD in the current shell, and (optionally) restarts the backend service so it
  reconnects with the new credential.

  Modes (mutually exclusive via parameter sets):
    Secure:   -Password <SecureString>
    Plain:    -Plain <string>
    Generate: -Generate [-Length N]

  Optional:
    -UpdateEnvFile   Update (create if missing) env file with POSTGRES_PASSWORD=...
    -Show            Echo password (opt-in; hidden by default)
    -NoVerify        Skip remote ephemeral psql verification
    -User/-Host/-Port Override target role/host/port (default myuser/postgres/5432)
    -HealthTimeoutSec  Max seconds to wait for /health/simple after restart
    -HealthIntervalSec Poll interval for health

  If the Postgres container is not running, the script aborts (run your dev stack first or start postgres only).

 .EXAMPLES
  # Generate a random password, update env file, restart backend
  pwsh ./scripts/set-dev-password.ps1 -Generate -UpdateEnvFile -RestartBackend

  # Provide a plain text password (unsafe echo) and restart backend
  pwsh ./scripts/set-dev-password.ps1 -Plain "localStrong!123" -RestartBackend

  # SecureString prompt then update env file only
  $sec = Read-Host "Enter new password" -AsSecureString
  pwsh ./scripts/set-dev-password.ps1 -Password $sec -UpdateEnvFile

  # Generate custom length 36 chars
  pwsh ./scripts/set-dev-password.ps1 -Generate -Length 36 -UpdateEnvFile

.NOTES
  Requires: docker CLI in PATH, running container named <Project>-postgres-1
###>

$ErrorActionPreference = 'Stop'

# --- Parameter Validation -----------------------------------------------------
# Parameter set already enforces exclusivity; soft guard for robustness
if (@($Password,$Plain,$Generate | Where-Object { $_ }).Count -ne 1) { Write-Host "Specify one mode" -ForegroundColor Yellow; exit 2 }

function New-RandomPassword { param([int]$Len = 24)
  $alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz0123456789!@#$%^&*()-_=+[]{}'
  $bytes = New-Object byte[] ($Len)
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  -join ($bytes | ForEach-Object { $alphabet[ $_ % $alphabet.Length ] }) }

function Convert-SecureStringToPlain([SecureString]$s) {
  if (-not $s) { return $null }
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)
  try { [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}

if ($Generate) { $PasswordPlain = New-RandomPassword -Len $Length }
elseif ($Plain) { $PasswordPlain = $Plain }
else { $PasswordPlain = Convert-SecureStringToPlain $Password }

if (-not $PasswordPlain) { Write-Host "Could not resolve password value" -ForegroundColor Red; exit 3 }
if ($PasswordPlain.Length -lt 8) { Write-Host "Password length < 8 (refusing)" -ForegroundColor Red; exit 4 }
if ($Show) { Write-Host "[password] $PasswordPlain" -ForegroundColor Yellow } else { Write-Host "[password] (hidden)" -ForegroundColor DarkGray }

function Write-Info($msg){ Write-Host "[info] $msg" -ForegroundColor Cyan }
function Write-Warn($msg){ Write-Warning $msg }
function Write-Err($msg){ Write-Host "[error] $msg" -ForegroundColor Red }

$pgContainer = "$Project-postgres-1"

# 1. Validate container running
$psOut = docker ps --format '{{.Names}}' | Where-Object { $_ -eq $pgContainer }
if (-not $psOut) {
  Write-Err "Postgres container '$pgContainer' not running. Start it first (e.g. dev-docker.ps1)"
  exit 1
}

# 2. Apply password inside container
Write-Info "Updating password for role $User inside $pgContainer"
# Escape single quotes inside password for SQL literal safety
$escaped = $PasswordPlain.Replace("'","''")
$alterCmd = "ALTER ROLE $User WITH PASSWORD '$escaped';"
$rc = docker exec $pgContainer psql -v ON_ERROR_STOP=1 -U $User -d postgres -c $alterCmd 2>&1
if ($LASTEXITCODE -ne 0) {
  Write-Err "ALTER ROLE failed: $rc"
  exit 1
}
Write-Info "Password updated (role $User)"

# 3. Export in current shell for compose interpolation
$env:POSTGRES_PASSWORD = $PasswordPlain
Write-Info "Exported POSTGRES_PASSWORD in this session"

# 3b. Update .env.dev.local if requested
if ($UpdateEnvFile) {
  Write-Info "Updating $EnvFile with POSTGRES_PASSWORD=... (atomic)"
  if (-not (Test-Path $EnvFile)) { New-Item -ItemType File -Path $EnvFile -Force | Out-Null }
  $lines = Get-Content $EnvFile -ErrorAction SilentlyContinue
  $filtered = @(); $found = $false
  foreach ($l in $lines) { if ($l -match '^POSTGRES_PASSWORD=') { $filtered += "POSTGRES_PASSWORD=$PasswordPlain"; $found = $true } else { $filtered += $l } }
  if (-not $found) { $filtered += "POSTGRES_PASSWORD=$PasswordPlain" }
  $tmp = "$EnvFile.tmp"
  $filtered | Set-Content $tmp -Encoding UTF8 -NoNewline; Add-Content $tmp "`n"; Move-Item -Force $tmp $EnvFile
  Write-Info "Env file updated atomically"
}

# 4. Optional backend restart
if ($RestartBackend) {
  Write-Info "Restarting backend service"
  if ($PSCmdlet.ShouldProcess('backend','restart')) {
    docker compose -f $ComposeFile -p $Project up -d backend
    if ($LASTEXITCODE -ne 0) { Write-Err "Backend restart failed"; exit 1 }
    Write-Info "Backend restarted"
  }
  # Health poll
  $deadline = (Get-Date).AddSeconds($HealthTimeoutSec); $ok=$false
  while ((Get-Date) -lt $deadline) {
    try { $resp = curl -sS http://127.0.0.1:8000/health/simple 2>$null; if ($LASTEXITCODE -eq 0 -and $resp -match '"ok":true') { $ok=$true; break } } catch {}
    Start-Sleep -Seconds $HealthIntervalSec
  }
  if (-not $ok) { Write-Warn "Backend health not confirmed within ${HealthTimeoutSec}s" } else { Write-Info "Backend health OK" }
}

# 5. Remote verification (psql over network)
if (-not $NoVerify) {
  Write-Info "Verifying TCP auth via ephemeral client"
  $test = docker run --rm --network ${Project}_default -e PGPASSWORD="$PasswordPlain" postgres:15 psql -h $DbHost -p $Port -U $User -d finance -c "SELECT 'pw_ok'" 2>&1
  if ($LASTEXITCODE -ne 0) { Write-Warn "Remote password check failed (backend may still be starting). Details:\n$test" } else { Write-Info "Remote auth succeeded" }
} else { Write-Info "Skipping remote verification (-NoVerify)" }

Write-Host "Done." -ForegroundColor Green
