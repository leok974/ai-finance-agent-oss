<#!
.SYNOPSIS
  Lightweight auth endpoint smoke check (external or internal).

.DESCRIPTION
  Invokes POST /api/auth/login with a known-bad credential payload and validates we get
  a 401 or 422 (never 404). Can also optionally test legacy /auth/ redirect and OPTIONS
  preflight. Designed to be idempotent and quick (<1s typical).

.PARAMETER Base
  Base URL including scheme + host (e.g. https://app.ledger-mind.org or http://localhost).

.PARAMETER Legacy
  Also test legacy /auth/login path to ensure redirect/canonicalization still present.

.EXAMPLE
  pwsh ./scripts/smoke-auth.ps1 -Base https://app.ledger-mind.org -Legacy
#>
[CmdletBinding()]param(
  [Parameter(Mandatory)][string]$Base,
  [switch]$Legacy
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Invoke-Login([string]$Url,[string]$Payload){
  # Use curl for consistent status/code capture; PowerShell Invoke-RestMethod hides details.
  $tmp = New-TemporaryFile | ForEach-Object FullName
  try {
    $full = "$Url" + '?__nocache=1'
    $resp = curl -sk -o $tmp -w '%{http_code}' -X POST "$full" -H 'content-type: application/json' -d $Payload
    $body = Get-Content $tmp -Raw
    [pscustomobject]@{ Code = [int]$resp; Body = $body }
  } finally { Remove-Item -ErrorAction SilentlyContinue $tmp }
}

$payload = '{"email":"nobody@example.com","password":"bad"}'
$primary = "$Base/api/auth/login"
$r = Invoke-Login -Url $primary -Payload $payload
if ($r.Code -in 401,422) { Write-Host "[auth] /api/auth/login -> $($r.Code) OK" -ForegroundColor Green } else { Write-Host "[auth] /api/auth/login unexpected status $($r.Code)" -ForegroundColor Red; Write-Host $r.Body }

if ($Legacy) {
  $legacyUrl = "$Base/auth/login"
  $rl = Invoke-Login -Url $legacyUrl -Payload $payload
  if ($rl.Code -in 401,422,308) { Write-Host "[auth] /auth/login -> $($rl.Code) (legacy path)" -ForegroundColor Yellow } else { Write-Host "[auth] legacy unexpected $($rl.Code)" -ForegroundColor Red }
}

# Preflight OPTIONS quick check (CORS fast-path should return 204)
  $pre = curl -sk -o /dev/null -w '%{http_code}' -X OPTIONS ("$Base/api/auth/login" + '?__nocache=1') -H 'origin: https://example.test'
if ($pre -eq 204) { Write-Host "[auth] OPTIONS preflight 204 OK" -ForegroundColor Green } else { Write-Host "[auth] OPTIONS preflight unexpected $pre" -ForegroundColor Red }
exit 0
