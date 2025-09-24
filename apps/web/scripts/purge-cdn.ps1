param(
  [string]$ZoneId = $env:CLOUDFLARE_ZONE_ID,
  [string]$ApiToken = $env:CLOUDFLARE_API_TOKEN,
  [string]$GlobalApiKey = $env:CLOUDFLARE_GLOBAL_API_KEY,
  [string]$Email = $env:CLOUDFLARE_EMAIL,
  [string[]]$Hosts = @('https://ledger-mind.org','https://www.ledger-mind.org','https://app.ledger-mind.org')
)

if (-not $ZoneId) { Write-Error "CLOUDFLARE_ZONE_ID is required"; exit 2 }

# Compute repo root (three levels up from this script directory) and locate root purge script
$repoRoot = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $PSScriptRoot))
$script = Join-Path -Path $repoRoot -ChildPath 'scripts\purge-cloudflare.ps1'
if (-not (Test-Path $script)) { Write-Error "Unable to locate purge-cloudflare.ps1 at $script"; exit 2 }

# Pass through available credentials
$common = @{ ZoneId = $ZoneId; Hosts = $Hosts }
if ($ApiToken) { $common.ApiToken = $ApiToken }
if ($GlobalApiKey -and $Email) { $common.GlobalApiKey = $GlobalApiKey; $common.Email = $Email }

& $script @common
