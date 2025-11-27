<#!
.SYNOPSIS
  Safely fingerprint and load a Cloudflare Tunnel connector token for compose.

.DESCRIPTION
  Reads a token file, trims whitespace, prints length/dot count/fingerprint, exports CLOUDFLARE_TUNNEL_TOKEN for the session.

.USAGE
  pwsh -File scripts/tunnel-token-fingerprint.ps1 -Path secrets/cloudflared_token.txt
#>

[CmdletBinding()] param(
  [Parameter(Mandatory=$true)][string]$Path
)

if (-not (Test-Path $Path)) { throw "Token file not found: $Path" }
$raw = (Get-Content $Path -Raw).Trim()
[IO.File]::WriteAllText($Path,$raw)

if (-not $raw) { throw 'Token file empty after trim.' }

$len = $raw.Length
$dots = ($raw -split '\.').Count
$prefix = $raw.Substring(0,[Math]::Min(10,$len))
$suffix = $raw.Substring([Math]::Max(0,$len-8))
Write-Host ("Length: {0}" -f $len)
Write-Host ("Dots:   {0}" -f $dots)
Write-Host ("FPR:    {0}...{1}" -f $prefix,$suffix)

$env:CLOUDFLARE_TUNNEL_TOKEN = $raw
Write-Host '[CLOUDFLARE_TUNNEL_TOKEN exported to session]' -ForegroundColor Green
