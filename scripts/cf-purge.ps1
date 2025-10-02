param(
  [string]$Base = 'https://app.ledger-mind.org',
  [string]$Dist = 'apps/web/dist',
  [string]$Extra = '/site.webmanifest,/favicon.ico'
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Write-Error 'Node.js is required.'; exit 2 }
if (-not $env:CLOUDFLARE_API_TOKEN -or -not $env:CLOUDFLARE_ZONE_ID) {
  Write-Error 'Set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ZONE_ID environment variables.'; exit 2
}
Write-Host "Purging Cloudflare cache for $Base (dist=$Dist)" -ForegroundColor Cyan
node "$PSScriptRoot/cf-purge.js" --base=$Base --dist=$Dist --extra=$Extra
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }