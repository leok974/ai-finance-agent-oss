param(
  [string]$ZoneId = $env:CLOUDFLARE_ZONE_ID,
  [string]$ApiToken = $env:CLOUDFLARE_API_TOKEN,
  [string]$GlobalApiKey = $env:CLOUDFLARE_GLOBAL_API_KEY,
  [string]$Email = $env:CLOUDFLARE_EMAIL,
  [string[]]$Hosts = @('https://ledger-mind.org','https://app.ledger-mind.org')
)

if (-not $ZoneId) { Write-Error "CLOUDFLARE_ZONE_ID is required"; exit 2 }

$script = Join-Path (Split-Path -Parent $PSScriptRoot) '..' '..' 'scripts' 'purge-cloudflare.ps1' | Resolve-Path

# Pass through available credentials
$common = @{ ZoneId = $ZoneId; Hosts = $Hosts }
if ($ApiToken) { $common.ApiToken = $ApiToken }
if ($GlobalApiKey -and $Email) { $common.GlobalApiKey = $GlobalApiKey; $common.Email = $Email }

& $script @common
