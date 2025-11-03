[CmdletBinding(DefaultParameterSetName='Generate', SupportsShouldProcess=$true)]
param(
  [Parameter(ParameterSetName='Secure', Mandatory=$true)] [SecureString]$Password,
  [Parameter(ParameterSetName='Plain', Mandatory=$true)]  [string]$Plain,
  [Parameter(ParameterSetName='Generate', Mandatory=$true)] [switch]$Generate,
  [Parameter(ParameterSetName='Generate')] [int]$Length = 24,
  [string]$EnvFile = '.env.prod.local',
  [switch]$UpdateEnvFile,
  [switch]$NoVerify,
  [switch]$Show,
  [int]$ReadyTimeoutSec = 120,
  [int]$ReadyIntervalSec = 3
)

$ErrorActionPreference = 'Stop'
function Write-Info($m){ Write-Host "[info] $m" -ForegroundColor Cyan }
function Write-Warn($m){ Write-Host "[warn] $m" -ForegroundColor Yellow }
function Write-Err($m){ Write-Host "[error] $m" -ForegroundColor Red }

function New-Rand {
  param([int]$L=24)
  $chars = ('ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^*-_=+?').ToCharArray()
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  $bytes = New-Object byte[] ($L)
  $sb = New-Object System.Text.StringBuilder
  while ($sb.Length -lt $L) {
    $rng.GetBytes($bytes)
    foreach ($b in $bytes) { if ($sb.Length -lt $L) { $sb.Append($chars[$b % $chars.Length]) > $null } }
  }
  $sb.ToString()
}

switch ($PsCmdlet.ParameterSetName) {
  'Generate' { $pw = New-Rand -L $Length }
  'Secure'   { $pw = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($Password)) }
  'Plain'    { $pw = $Plain }
}
if (-not $pw) { Write-Err 'Could not resolve password'; exit 2 }
if ($pw.Length -lt 8) { Write-Err 'Password must be at least 8 characters'; exit 3 }
if ($Show) { Write-Host "[password] $pw" -ForegroundColor Yellow } else { Write-Host "[password] (hidden)" -ForegroundColor DarkGray }

$FILES = @('-f','docker-compose.prod.yml','-f','docker-compose.prod.override.yml')
$alter = "ALTER ROLE myuser WITH PASSWORD '" + ($pw -replace "'","''") + "';"
Write-Info 'Applying new Postgres role password'
if ($PSCmdlet.ShouldProcess('postgres','ALTER ROLE password')) {
  docker compose $FILES exec -T postgres psql -U myuser -d postgres -v ON_ERROR_STOP=1 -c "$alter"
  if ($LASTEXITCODE -ne 0) { Write-Err 'ALTER ROLE failed'; exit 4 }
}

# Optional env file update (atomic)
if ($UpdateEnvFile) {
  Write-Info "Updating $EnvFile"
  if (-not (Test-Path $EnvFile)) { New-Item -ItemType File -Path $EnvFile -Force | Out-Null }
  $raw = Get-Content $EnvFile -Raw -ErrorAction SilentlyContinue
  if (-not $raw) { $raw = '' }
  $line = "POSTGRES_PASSWORD=$pw"
  if ($raw -match '^POSTGRES_PASSWORD=.*$') {
    $new = $raw -replace '^POSTGRES_PASSWORD=.*$', $line
  } else {
    $nl = ($raw.EndsWith("`n")) ? '' : "`n"
    $new = "$raw$nl$line`n"
  }
  $tmp = "$EnvFile.tmp"
  Set-Content -Path $tmp -Value $new -NoNewline
  Move-Item -Force $tmp $EnvFile
  Write-Info 'Env file updated'
}

# Export in current session to support subsequent compose calls manually
$env:POSTGRES_PASSWORD = $pw
Write-Info 'Exported POSTGRES_PASSWORD in current session'

Write-Info 'Restarting backend'
if ($PSCmdlet.ShouldProcess('backend','restart')) {
  docker compose $FILES restart backend
  if ($LASTEXITCODE -ne 0) { Write-Err 'Backend restart failed'; exit 5 }
}

if (-not $NoVerify) {
  Write-Info 'Waiting for readiness (edge /ready)...'
  $deadline = (Get-Date).AddSeconds($ReadyTimeoutSec)
  $ok = $false
  while ((Get-Date) -lt $deadline) {
    try {
      $code = (curl.exe -s -o NUL -w "%{http_code}" https://app.ledger-mind.org/ready)
      if ($code -eq '200') { $ok = $true; break }
    } catch {}
    Start-Sleep -Seconds $ReadyIntervalSec
  }
  if (-not $ok) { Write-Err "Backend not ready within ${ReadyTimeoutSec}s"; exit 6 } else { Write-Info 'Ready ✓' }
} else {
  Write-Warn 'Skipped readiness verification (-NoVerify)'
}

Write-Host 'Done.' -ForegroundColor Green
