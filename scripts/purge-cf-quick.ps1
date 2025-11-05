<#
  Quick Cloudflare cache purge

  Defaults to a targeted purge of critical URLs across app hosts.
  Use -Everything (optionally with -Force) to purge the entire zone.

  Env var fallbacks: CLOUDFLARE_ZONE_ID, CLOUDFLARE_API_TOKEN,
  or CLOUDFLARE_GLOBAL_KEY + CLOUDFLARE_EMAIL.

  Examples:
    pwsh -File scripts/purge-cf-quick.ps1                           # targeted purge using env vars
    pwsh -File scripts/purge-cf-quick.ps1 -Everything -Force        # purge entire zone (no prompt)
    pwsh -File scripts/purge-cf-quick.ps1 -ZoneId Z -ApiToken T     # explicit params
#>
[CmdletBinding(SupportsShouldProcess=$true, ConfirmImpact='High')]
param(
  [string]$ZoneId = $env:CLOUDFLARE_ZONE_ID,
  [string]$ApiToken = $env:CLOUDFLARE_API_TOKEN,
  [string]$GlobalApiKey = $env:CLOUDFLARE_GLOBAL_KEY,
  [string]$Email = $env:CLOUDFLARE_EMAIL,
  [switch]$Everything,
  [switch]$Force,
  [string[]]$Hosts = @('https://ledger-mind.org','https://www.ledger-mind.org','https://app.ledger-mind.org'),
  [string[]]$Paths = @('/index.html','/site.webmanifest','/favicon.ico','/favicon.svg','/apple-touch-icon.png')
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not $ZoneId) { Write-Error 'ZoneId not provided. Set -ZoneId or CLOUDFLARE_ZONE_ID.'; exit 2 }
if (-not $ApiToken -and (-not $GlobalApiKey -or -not $Email)) {
  Write-Error 'Provide -ApiToken (preferred) or CLOUDFLARE_API_TOKEN; or both -GlobalApiKey and -Email (or CLOUDFLARE_GLOBAL_KEY + CLOUDFLARE_EMAIL).'
  exit 2
}

$endpoint = "https://api.cloudflare.com/client/v4/zones/$ZoneId/purge_cache"
$commonHeaders = @{ 'Content-Type' = 'application/json' }
if ($ApiToken) {
  $headers = $commonHeaders.Clone()
  $headers['Authorization'] = "Bearer $ApiToken"
} else {
  $headers = $commonHeaders.Clone()
  $headers['X-Auth-Email'] = $Email
  $headers['X-Auth-Key'] = $GlobalApiKey
}

if ($Everything) {
  if (-not $Force) {
    $ans = Read-Host 'Purge ENTIRE zone cache? This invalidates all CDN content. Type YES to continue'
    if ($ans -ne 'YES') { Write-Host 'Aborted.' -ForegroundColor Yellow; exit 0 }
  }
  Write-Host 'Purging ENTIRE Cloudflare zone cache…' -ForegroundColor Cyan
  $body = '{"purge_everything":true}'
} else {
  # Targeted purge: critical HTML/manifest/icon URLs across known hosts.
  $urls = [System.Collections.Generic.List[string]]::new()
  foreach ($h in $Hosts) {
    foreach ($p in $Paths) { $urls.Add(("{0}{1}" -f $h, $p)) }
  }
  $uniqueUrls = $urls | Select-Object -Unique
  Write-Host ("Purging {0} URLs…" -f $uniqueUrls.Count) -ForegroundColor Cyan
  $body = @{ files = $uniqueUrls } | ConvertTo-Json
}

if ($PSCmdlet.ShouldProcess($endpoint, 'POST purge_cache')) {
  try {
    $response = Invoke-RestMethod -Method POST -Uri $endpoint -Headers $headers -Body $body
    if (-not $response.success) {
      $err = $response.errors | ConvertTo-Json -Depth 5
      Write-Error "Purge failed: $err"
      exit 1
    }
    Write-Host "✓ Purge request accepted." -ForegroundColor Green
    if (-not $Everything) { Write-Host ($body) -ForegroundColor DarkGray }
  } catch {
    $status = $_.Exception.Response.StatusCode.Value__
    $msg = $_.ErrorDetails.Message; if (-not $msg) { $msg = $_.Exception.Message }
    Write-Error ("HTTP {0} - {1}" -f $status, $msg)
    exit 1
  }
} else {
  Write-Host '[WhatIf] Skipping API call. Request would be:' -ForegroundColor Yellow
  Write-Host "POST $endpoint" -ForegroundColor DarkGray
  Write-Host ($body) -ForegroundColor DarkGray
}
