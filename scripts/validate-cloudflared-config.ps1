<#!
.SYNOPSIS
  Validates that cloudflared credentials-file mode config is internally consistent.
.DESCRIPTION
  Checks:
    * Exactly one tunnel UUID appears in config.yml 'tunnel:' line.
    * A credentials JSON file with matching UUID exists in ./cloudflared.
    * No stray different *.json UUIDs (warn if present).
    * docker-compose.prod.override.yml does not set a non-empty TUNNEL_TOKEN.
    * Ensures config.yml does not begin with an accidental 'ingress:' line.
.EXIT CODES
  0 success, 1 validation failure.
#>
[CmdletBinding()]
param(
  [string]$CloudflaredDir = "cloudflared",
  [string]$ConfigFile = "cloudflared/config.yml",
  [string]$ComposeOverride = "docker-compose.prod.override.yml"
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Fail($msg){ Write-Host "ERROR: $msg" -ForegroundColor Red; exit 1 }
function Warn($msg){ Write-Host "WARN: $msg" -ForegroundColor Yellow }

if (-not (Test-Path $ConfigFile)) { Fail "Missing config file: $ConfigFile" }
$content = Get-Content $ConfigFile -Raw
if ($content -match "^ingress:\s*$") { Fail "Config starts with stray 'ingress:' line (format corruption)." }

$uuidMatch = [regex]::Match($content, "(?m)^tunnel:\s*([0-9a-fA-F-]{36})\s*$")
if (-not $uuidMatch.Success) { Fail "Unable to find tunnel UUID in $ConfigFile" }
$tunnelUUID = $uuidMatch.Groups[1].Value
Write-Host "Found tunnel UUID: $tunnelUUID" -ForegroundColor Cyan

$credFileMatch = [regex]::Match($content, "(?m)^credentials-file:\s*/etc/cloudflared/([0-9a-fA-F-]{36})\.json\s*$")
if (-not $credFileMatch.Success) { Fail "credentials-file line missing or malformed." }
$credUUID = $credFileMatch.Groups[1].Value
if ($credUUID -ne $tunnelUUID) { Fail "Mismatch: tunnel UUID $tunnelUUID vs credentials-file UUID $credUUID" }

$localJson = Join-Path $CloudflaredDir ("$tunnelUUID.json")
if (-not (Test-Path $localJson)) { Fail "Credentials JSON not found: $localJson" }
Write-Host "Credentials JSON present: $localJson" -ForegroundColor Green

# Parse JSON minimally
try { $j = Get-Content $localJson -Raw | ConvertFrom-Json } catch { Fail "Failed to parse JSON credentials: $_" }
if ($j.TunnelID -ne $tunnelUUID) { Fail "TunnelID inside JSON ($($j.TunnelID)) does not match $tunnelUUID" }
Write-Host "Credentials JSON TunnelID matches." -ForegroundColor Green

# Look for other JSON files with different UUIDs
$otherJson = Get-ChildItem $CloudflaredDir -Filter '*.json' -File | Where-Object { $_.Name -notlike "$tunnelUUID.json" }
foreach($f in $otherJson){ Warn "Extra credentials file present: $($f.Name)" }

# Ensure compose override neutralizes token usage
if (-not (Test-Path $ComposeOverride)) { Warn "Compose override not found ($ComposeOverride); skip token check" }
else {
  $composeRaw = Get-Content $ComposeOverride -Raw
  if ($composeRaw -match '(?m)^\s*TUNNEL_TOKEN:\s*"?[^"\s]') { Fail "Non-empty TUNNEL_TOKEN set in override (token mode still active)." }
  else { Write-Host "TUNNEL_TOKEN correctly empty / absent in override." -ForegroundColor Green }
}

Write-Host "All cloudflared config validations passed." -ForegroundColor Magenta
