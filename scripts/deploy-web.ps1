[CmdletBinding()]param(
  [string]$ComposeProd = 'docker-compose.prod.yml',
  [string]$ComposeOverride = 'docker-compose.prod.override.yml',
  [switch]$NoFeatureFlags,
  [switch]$NoSmokes,
  [switch]$NoAnalyticsEvent
)
$ErrorActionPreference = 'Stop'
function Info($m){ Write-Host "[deploy-web] $m" -ForegroundColor Cyan }
function Fail($m){ Write-Host "[deploy-web][ERROR] $m" -ForegroundColor Red; exit 1 }

# --- Helpers ---------------------------------------------------------------
function Get-HttpStatus {
  param([string]$Url)
  # Prefer real curl if available (for -w support)
  $curl = Get-Command curl.exe -ErrorAction SilentlyContinue
  if($curl){
    try {
      $status = & $curl.Path -s -o NUL -w '%{http_code}' $Url
      return $status
    } catch { return '' }
  } else {
    # Fallback to Invoke-WebRequest (no -w); capture status or 0
    try {
      $resp = Invoke-WebRequest -UseBasicParsing -Uri $Url -Method GET -TimeoutSec 6
      return [string]$resp.StatusCode
    } catch {
      if($_.Exception.Response){ return [string]$_.Exception.Response.StatusCode } else { return '' }
    }
  }
}

function Post-JsonStatus {
  param([string]$Url,[string]$Json)
  $curl = Get-Command curl.exe -ErrorAction SilentlyContinue
  if($curl){
    try {
      $status = & $curl.Path -s -o NUL -w '%{http_code}' -H 'content-type: application/json' --data $Json $Url
      return $status
    } catch { return '' }
  } else {
    try {
      $resp = Invoke-RestMethod -UseBasicParsing -Uri $Url -Method POST -Body $Json -ContentType 'application/json' -TimeoutSec 6 -SkipHttpErrorCheck:$true
      # Invoke-RestMethod throws for non-2xx; above -SkipHttpErrorCheck avoids that (PS7+). Fallback if not supported.
      if($resp.PSObject.Properties.Name -contains 'StatusCode'){ return [string]$resp.StatusCode }
      return '204' # assume success if no explicit code and no exception
    } catch {
      if($_.Exception.Response){ return [string]$_.Exception.Response.StatusCode } else { return '' }
    }
  }
}

# 1. Feature flags (unless suppressed)
if(-not $NoFeatureFlags){
  $env:VITE_SUGGESTIONS_ENABLED = '1'
  $env:VITE_ANALYTICS_ENABLED   = '1'
  Info 'Feature flags enabled (suggestions + analytics)'
} else {
  Info 'Skipping feature flag env exports'
}

# 2. Frontend build
Info 'Building web bundle (pnpm build)'
& pnpm -C apps/web run build | Write-Host
if($LASTEXITCODE -ne 0){ Fail 'Web build failed' }

Info 'CSP: runtime hashing only (no build-time csp:hash step)'

# 4. Rebuild nginx image
Info 'Rebuilding nginx image'
& docker compose -f $ComposeProd -f $ComposeOverride build nginx | Write-Host
if($LASTEXITCODE -ne 0){ Fail 'Nginx build failed' }

# 5. Up nginx (and dependent services if needed)
Info 'Starting nginx (up -d)'
& docker compose -f $ComposeProd -f $ComposeOverride up -d nginx | Write-Host
if($LASTEXITCODE -ne 0){ Fail 'docker compose up failed' }

if($NoSmokes){ Info 'Skipping smoke probes'; exit 0 }

# Allow a brief grace period for entrypoint scripts & healthchecks
Start-Sleep -Seconds 2

# 6. Quick smokes
$probes = @(
  @{ name='ROOT';    url='http://127.0.0.1/'; expect=200 },
  @{ name='READY';   url='http://127.0.0.1/_up'; expect=204 },
  @{ name='HEALTH';  url='http://127.0.0.1/api/healthz'; expect=200 },
  @{ name='METRICS'; url='http://127.0.0.1/metrics'; expect=200 }
)

foreach($p in $probes){
  $ok = $false
  for($i=1; $i -le 10; $i++){
    $code = Get-HttpStatus $p.url
    Write-Host ("{0,-8} {1} (attempt {2})" -f $p.name, ($code -replace '^$','<none>'), $i)
    if([string]::IsNullOrWhiteSpace($code) -or $code -eq '000') { Start-Sleep -Milliseconds 500; continue }
    if([int]$code -eq $p.expect){ $ok = $true; break } else { Start-Sleep -Milliseconds 500 }
  }
  if(-not $ok){ Fail "Probe $($p.name) failed after retries" }
}

if(-not $NoAnalyticsEvent){
  # Analytics passthrough test
  $json = @{ event = "deploy_web_smoke"; props = @{ email = 'deploy@example.com'; note='ok' } } | ConvertTo-Json -Compress
  $code = Post-JsonStatus 'http://127.0.0.1/agent/analytics/event' $json
  "ANALYTICS $code" | Write-Host
  if([string]::IsNullOrWhiteSpace($code) -or $code -ne '204'){ Fail 'Analytics passthrough failed' }
} else { Info 'Skipping analytics event smoke' }

Info 'Deployment complete and smokes passed.'
