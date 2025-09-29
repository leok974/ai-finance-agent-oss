<#
 .SYNOPSIS
  Securely prompts for a Cloudflare Tunnel connector token, fingerprints it (without revealing full value),
  writes it to the repo root .env (CLOUDFLARE_TUNNEL_TOKEN=...), and optionally a backup secrets file.

 .DESCRIPTION
  Avoids accidental whitespace, BOM, or quoting issues. If an existing token is present it will be replaced
  only after confirmation. Produces a concise fingerprint (length, dot count, prefix/suffix) for logs.

 .USAGE
  PS> ./scripts/load-cloudflared-token.ps1            # interactive
  PS> ./scripts/load-cloudflared-token.ps1 -Token "<paste>" -NonInteractive

  After running, recreate service:
    $FILES = @('-f','docker-compose.prod.yml','-f','docker-compose.prod.override.yml')
    docker compose @FILES up -d --force-recreate cloudflared

 .NOTES
  The script never echoes the full token. Backup file stored at secrets/cloudflared_token.txt (git-ignored).
  Ensure you run from the repository root so .env is located correctly.
#>
param(
  [string]$Token,
  [switch]$NonInteractive,
  [switch]$SkipBackup
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-CloudflaredToken {
  Write-Host 'Paste the Cloudflare Tunnel token (it will NOT be displayed). Press Enter when done.' -ForegroundColor Cyan
  $secure = Read-Host -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}

if (-not $Token) {
  if ($NonInteractive) { throw 'Token not provided and NonInteractive specified.' }
  $Token = Get-CloudflaredToken
}

$Token = $Token.Trim()
if (-not $Token) { throw 'Empty token after trim.' }

# Basic shape check: should have 2 or 3 dots
$dotCount = ($Token.ToCharArray() | Where-Object { $_ -eq '.' }).Count
if ($dotCount -lt 2) {
  throw "Token appears invalid: dot count $dotCount (expected >=2). Did you copy ONLY the value after --token from the Cloudflare UI?"
}
if ($dotCount -gt 4) {
  Write-Warning "Unusual token dot count: $dotCount (>4). Verify you didn't concatenate multiple lines." 
}

$prefix = $Token.Substring(0, [Math]::Min(10, $Token.Length))
$suffix = $Token.Substring([Math]::Max(0, $Token.Length - 8))
Write-Host ("Token fingerprint -> len={0} dots={1} fpr={2}...{3}" -f $Token.Length, $dotCount, $prefix, $suffix) -ForegroundColor Green

$envPath = Join-Path (Get-Location) '.env'
$backupPath = Join-Path (Get-Location) 'secrets/cloudflared_token.txt'

# Read existing .env (if present) without altering BOM unnecessarily.
$existing = ''
if (Test-Path $envPath) { $existing = Get-Content $envPath -Raw }

# Update or insert line.
$pattern = '^CLOUDFLARE_TUNNEL_TOKEN=' # start anchor
if ($existing -match $pattern) {
  if (-not $NonInteractive) {
    $resp = Read-Host 'A CLOUDFLARE_TUNNEL_TOKEN already exists. Overwrite? (y/N)'
    if ($resp.ToLower() -ne 'y') { Write-Host 'Aborted.'; exit 1 }
  }
  $updated = [System.Text.RegularExpressions.Regex]::Replace($existing, $pattern + '.*', 'CLOUDFLARE_TUNNEL_TOKEN=' + $Token, 'Multiline')
} else {
  if ($existing -and -not $existing.EndsWith("`n")) { $existing += "`n" }
  $updated = $existing + 'CLOUDFLARE_TUNNEL_TOKEN=' + $Token + "`n"
}

# Write without BOM using explicit byte write (avoids parser issues with constructor overload)
$utf8NoBomEnc = [System.Text.UTF8Encoding]::new($false)
[IO.File]::WriteAllBytes($envPath, $utf8NoBomEnc.GetBytes($updated))
Write-Host ".env updated." -ForegroundColor Yellow

if (-not $SkipBackup) {
  if (-not (Test-Path (Split-Path $backupPath))) { New-Item -ItemType Directory -Force -Path (Split-Path $backupPath) | Out-Null }
  [IO.File]::WriteAllBytes($backupPath, $utf8NoBomEnc.GetBytes($Token))
  Write-Host "Backup written to $backupPath" -ForegroundColor Yellow
}

Write-Host 'Recreate service: docker compose -f docker-compose.prod.yml -f docker-compose.prod.override.yml up -d --force-recreate cloudflared' -ForegroundColor Cyan