<#
  apps/backend/app/scripts/smoke-backend.ps1
  Purpose: Minimal, idempotent smoke for learning flows and acks.
  Steps:
    1) Health check
    2) Login (or register) -> capture cookies + CSRF
    3) POST /rules/test/apply (admin) with backfill=false
    4) Ensure at least 1 uncategorized txn exists (/dev/seed-unknowns)
    5) GET /dev/first-txn-id -> POST /txns/{id}/categorize
    Prints ack text lines when available and exits non-zero on HTTP >= 400.
#>

$ErrorActionPreference = "Stop"
function Fail($msg) { Write-Error $msg; exit 1 }

$base = $env:BACKEND_BASE_URL
if ([string]::IsNullOrWhiteSpace($base)) { $base = 'http://127.0.0.1:8000' }

Write-Output "[smoke] base=$base"

# 1) Health
try {
  $h = Invoke-RestMethod -Method GET -Uri "$base/healthz" -TimeoutSec 5
  if (-not $h.ok -and $h.status -ne 'ok') { Fail "Health check failed" }
  Write-Output "[smoke] health OK"
} catch { Fail "Health request failed: $_" }

# Cookie jar via WebSession
$sess = New-Object Microsoft.PowerShell.Commands.WebRequestSession

function CallJson([string]$method, [string]$url, $bodyObj=$null, $extraHeaders=@{}) {
  $params = @{
    Method = $method
    Uri = $url
    WebSession = $sess
    Headers = @{"Content-Type"="application/json"}
    ErrorAction = 'Stop'
  }
  foreach ($k in $extraHeaders.Keys) { $params.Headers[$k] = $extraHeaders[$k] }
  if ($bodyObj -ne $null) { $params.Body = ($bodyObj | ConvertTo-Json -Depth 8) }
  return Invoke-RestMethod @params
}

function GetCsrfHeader() {
  # Cookie set by backend: csrf_token
  $cookie = $sess.Cookies.GetCookies($base) | Where-Object { $_.Name -eq 'csrf_token' } | Select-Object -First 1
  if ($null -eq $cookie) { return @{} }
  return @{ 'X-CSRF-Token' = $cookie.Value }
}

# 2) Login or register
$email = $env:SMOKE_EMAIL; if (-not $email) { $email = 'admin@local' }
$password = $env:SMOKE_PASSWORD; if (-not $password) { $password = 'admin123' }

try {
  $login = CallJson POST "$base/auth/login" @{ email=$email; password=$password }
  Write-Output "[smoke] login OK"
} catch {
  Write-Output "[smoke] login failed, attempting register"
  try {
    $reg = CallJson POST "$base/auth/register" @{ email=$email; password=$password; roles=@('admin','analyst','user') }
    Write-Output "[smoke] register OK"
  } catch { Fail "Register failed: $_" }
}

# Refresh CSRF cookie if needed
try { $refresh = CallJson POST "$base/auth/refresh" $null (GetCsrfHeader) } catch { }

# 3) /rules/test/apply (admin), backfill=false to keep idempotent
$merchant = 'SMOKE-DEMO'
$category = 'Testing'
try {
  $resp = CallJson POST "$base/rules/test/apply" @{ merchant=$merchant; category=$category; backfill=$false; enabled=$true } (GetCsrfHeader)
  $ack = $resp.ack
  if ($ack) {
    $msg = if ($ack.llm) { $ack.llm } else { $ack.deterministic }
    Write-Output "[ack] $msg"
  } else {
    Write-Output "[smoke] rules/apply OK (no ack)"
  }
} catch { Fail "rules/test/apply failed: $_" }

# 4) Ensure an uncategorized txn exists for categorize path
try {
  $seed = CallJson POST "$base/dev/seed-unknowns" @{ count=1 } (GetCsrfHeader)
  Write-Output "[smoke] seed-unknowns existing=$($seed.existing) created=$($seed.created)"
} catch { Write-Output "[smoke] seed-unknowns skipped: $_" }

# 5) Categorize the first transaction
try {
  $first = CallJson GET "$base/dev/first-txn-id"
  $tid = $first.id
  if (-not $tid) { Fail "No transactions found to categorize" }
  $cat = CallJson POST "$base/txns/$tid/categorize" @{ category=$category } (GetCsrfHeader)
  $ack2 = $cat.ack
  if ($ack2) {
    $msg2 = if ($ack2.llm) { $ack2.llm } else { $ack2.deterministic }
    Write-Output "[ack] $msg2"
  } else {
    Write-Output "[smoke] txn categorize OK (no ack)"
  }
} catch { Fail "txn categorize failed: $_" }

Write-Output "[smoke] PASS"
exit 0
