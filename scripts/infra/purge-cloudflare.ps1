param(
  [Parameter(Mandatory=$true)][string]$ZoneId,
  [string]$ApiToken,
  [string]$GlobalApiKey,
  [string]$Email,
  [string[]]$Hosts = @('https://ledger-mind.org','https://www.ledger-mind.org','https://app.ledger-mind.org')
)

if (-not $ApiToken -and (-not $GlobalApiKey -or -not $Email)) {
  Write-Error "Provide either -ApiToken (recommended) or both -GlobalApiKey and -Email."
  exit 2
}

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
if ($ApiToken) {
  $headers = @{ 'Authorization' = "Bearer $ApiToken"; 'Content-Type' = 'application/json' }
} else {
  $headers = @{ 'X-Auth-Email' = $Email; 'X-Auth-Key' = $GlobalApiKey; 'Content-Type' = 'application/json' }
}
$endpoint = "https://api.cloudflare.com/client/v4/zones/$ZoneId/purge_cache"

Write-Host "Purging" $urls.Count "urls..." -ForegroundColor Cyan
try {
  $response = Invoke-RestMethod -Method POST -Uri $endpoint -Headers $headers -Body $body
  if (-not $response.success) {
    Write-Error "Purge failed: $($response | ConvertTo-Json -Depth 5)"
    exit 1
  } else {
    Write-Host "Purge success." ($response | ConvertTo-Json -Depth 5)
  }
} catch {
  $status = $_.Exception.Response.StatusCode.Value__
  $msg = $_.ErrorDetails.Message
  if (-not $msg) { $msg = $_.Exception.Message }
  Write-Error ("HTTP {0} - {1}" -f $status, $msg)
  throw
}
