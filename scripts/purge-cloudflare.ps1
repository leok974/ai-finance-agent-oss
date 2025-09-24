param(
  [Parameter(Mandatory=$true)][string]$ZoneId,
  [Parameter(Mandatory=$true)][string]$ApiToken,
  [string[]]$Hosts = @('https://ledger-mind.org','https://app.ledger-mind.org')
)

$ErrorActionPreference = 'Stop'

$paths = @(
  '/favicon.ico',
  '/favicon.svg',
  '/favicon.png',
  '/apple-touch-icon.png',
  '/favicon-192.png',
  '/favicon-512.png',
  '/site.webmanifest',
  '/og-card.png',
  '/index.html'
)

$urls = @()
foreach ($h in $Hosts) {
  foreach ($p in $paths) {
    $urls += "$h$p"
  }
}

$body = @{ files = $urls } | ConvertTo-Json
$headers = @{ 'Authorization' = "Bearer $ApiToken"; 'Content-Type' = 'application/json' }
$endpoint = "https://api.cloudflare.com/client/v4/zones/$ZoneId/purge_cache"

Write-Host "Purging" $urls.Count "urls..."
$response = Invoke-RestMethod -Method POST -Uri $endpoint -Headers $headers -Body $body
if (-not $response.success) {
  Write-Error "Purge failed: $($response | ConvertTo-Json -Depth 5)"
} else {
  Write-Host "Purge success." ($response | ConvertTo-Json -Depth 5)
}
