#[CmdletBinding()] param block extended with -SkipConflicts
[CmdletBinding()]param(
  [string]$HostName = 'app.ledger-mind.org',
  [int]$TimeoutSeconds = 5,
  [switch]$Json,
  [switch]$IncludeGenerate,
  [switch]$VerboseModels,
  [int]$TunnelMetricsPort = 2000,
  [int]$WarnLatencyMs = 800,
  [int]$CriticalLatencyMs = 2000,
  [string]$PrimaryModel = 'gpt-oss:20b',
  [string[]]$CriticalPorts = @('80','443','11434'),
  [switch]$SkipConflicts,
  [string]$ProjectName = 'ai-finance-agent-oss-clean',
  [switch]$TunnelStrict,
  [int]$MinHaConnections = 1,
  [switch]$SkipDns,
  [int]$DnsTimeoutMs = 2000,
  [int]$CertMinDays,
  [int]$Retry = 3,
  [int]$RetryDelaySec = 5,
  [switch]$EmitPromMetrics,
  # New SSE / extended features
  [switch]$SseProbe,
  [string]$SseUrl = '/agui/stream',
  [int]$SseTimeoutSec = 6
)
$ErrorActionPreference='Stop'

function Write-Info($m){ if(-not $Json){ Write-Host "[info] $m" -ForegroundColor Cyan } }
function Write-Ok($m){ if(-not $Json){ Write-Host "[ok]   $m" -ForegroundColor Green } }
function Write-Warn($m){ if(-not $Json){ Write-Host "[warn] $m" -ForegroundColor Yellow } }
function Write-Err($m){ if(-not $Json){ Write-Host "[err]  $m" -ForegroundColor Red } }

# ------------------------
# Helpers (header map / duplicates)
# ------------------------
function Get-HeaderMap {
  param([string]$RawHeaders)
  $map = [ordered]@{}
  $dups = @()
  if (-not $RawHeaders) { return ,($map,$dups) }
  $lines = $RawHeaders -split "`r?`n"
  foreach ($ln in $lines) {
    if ($ln -match '^\s*$') { break } # stop parsing headers at first blank line
    if ($ln -match '^\s*HTTP/') { continue }
    if ($ln -match '^(?<k>[^:]+):\s*(?<v>.*)$') {
      $k = $Matches.k.Trim()
      $v = $Matches.v.Trim()
      if ($map.Contains($k)) { $dups += $k }
      $map[$k] = $v
    }
  }
  return ,($map, ($dups | Select-Object -Unique))
}

# Hardened edge probe (adds --ssl-no-revoke on Windows to avoid Schannel revocation aborts)
function Invoke-EdgeProbe {
  param([Parameter(Mandatory=$true)][string]$Url,[int]$TimeoutSec=5)
  $isWin = $IsWindows -or ($PSStyle.Platform -eq 'Windows')
  $exe = if($isWin){ 'curl.exe' } else { 'curl' }
  $curlEdgeList = @('-s','-S','-D','-','-o','NUL','--max-time',"$TimeoutSec",'-w','%{http_code}\n', $Url)
  if($isWin){ $curlEdgeList = @('--ssl-no-revoke') + $curlEdgeList }
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = $exe
  $psi.Arguments = ($curlEdgeList -join ' ')
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError  = $true
  $psi.UseShellExecute = $false
  $p = [System.Diagnostics.Process]::Start($psi)
  $out = $p.StandardOutput.ReadToEnd()
  $err = $p.StandardError.ReadToEnd()
  $p.WaitForExit()
  $lines = $out -split "`r?`n"
  $httpCode = ($lines | Where-Object { $_ -match '^[0-9]{3}$' } | Select-Object -Last 1)
  if($httpCode -notmatch '^[0-9]{3}$'){ $httpCode = '000' }
  $class = 'ok'; $note = $null
  if($isWin -and ($p.ExitCode -ne 0)){
    if($err -match '(?i)schannel' -or $err -match 'CRYPT_E_NO_REVOCATION_CHECK' -or $p.ExitCode -eq 35){
      $class = 'tls_local_stack'
      $note = 'Windows Schannel revocation blocked handshake; using --ssl-no-revoke'
    } else { $class = 'error' }
  } elseif($httpCode -eq '000' -and $p.ExitCode -ne 0){ $class = 'error' }
  [pscustomobject]@{ url=$Url; http=$httpCode; exit=$p.ExitCode; class=$class; stderr=$err; note=$note }
}

$base = "https://$HostName"
$results = [ordered]@{
  host = $HostName
  ts = (Get-Date).ToString('o')
  endpoints = @{}
  llm = @{}
  tunnel = @{}
  conflicts = @{}
  dns = @{}
  tls = @{}
  summary = @{}
}
$fail = $false

function Invoke-Probe([string]$label,[string]$url,[int]$timeoutSec){
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  $isWin = $IsWindows -or ($PSStyle.Platform -eq 'Windows')
  $exe = $isWin ? 'curl.exe' : 'curl'
  $curlArgs = @('-s','-S','-o','NUL','-w','%{http_code}','--max-time',"$timeoutSec", $url)
  if($isWin){ $curlArgs = @('--ssl-no-revoke') + $curlArgs }
  $code='000'
  try {
    $out = & $exe @curlArgs 2>$null
    if($out -match '^[0-9]{3}$'){ $code = $out } else { $code='000' }
  } catch { $code='000' }
  $sw.Stop()
  $lat = [int]$sw.Elapsed.TotalMilliseconds
  # Allow certain endpoints to succeed with 204 (no content) semantics
  $successMap = @{ 'up' = @('200','204'); 'live' = @('200','204') }
  $okCodes = if($successMap.ContainsKey($label)){ $successMap[$label] } else { @('200') }
  $isOk = $okCodes -contains $code
  $status = if($isOk){ 'up'} else { "err:$code" }
  $severity = if(-not $isOk){ 'critical' } elseif($lat -ge $CriticalLatencyMs){ 'critical' } elseif($lat -ge $WarnLatencyMs){ 'warn'} else { 'ok'}
  $obj = [ordered]@{ code = $code; latency_ms = $lat; status = $status; severity = $severity }
  $results.endpoints[$label] = $obj
  if($severity -eq 'critical'){ $global:fail = $true }
  return $obj
}

# TLS certificate days remaining helper (simple .NET Tcp + SslStream)
function Get-CertDaysRemaining {
  param([Parameter(Mandatory=$true)][string]$TargetHost,[int]$Port=443)
  $client = $null
  try {
    $client = New-Object System.Net.Sockets.TcpClient($TargetHost,$Port)
    $ssl = New-Object System.Net.Security.SslStream($client.GetStream(),$false,{ $true })
    $ssl.AuthenticateAsClient($TargetHost)
    $cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($ssl.RemoteCertificate)
    $days = [int]([Math]::Floor(($cert.NotAfter.ToUniversalTime() - [DateTime]::UtcNow).TotalDays))
    return [ordered]@{ subject=$cert.Subject; not_after=$cert.NotAfter.ToString('o'); days_remaining=$days }
  } catch {
    return [ordered]@{ error=$_.Exception.Message }
  } finally { if($client){ $client.Close() } }
}

if(-not $SkipConflicts){
  try {
    Write-Info "Scanning for container port conflicts"
    $conflicts = @()
    $raw = docker ps --format '{{.ID}}|{{.Names}}|{{.Ports}}' 2>$null
    foreach($line in $raw){
      if(-not $line) { continue }
      $parts = $line -split '\|'
      if($parts.Count -lt 3){ continue }
      $cid,$cname,$ports = $parts
      foreach($p in $CriticalPorts){
        if($ports -match "(?i)(0\.0\.0\.0|127\.0\.0\.1):$p->" ){
          # Determine compose project (heuristic: split name components)
          $proj = ($cname -split '-')[0..($cname.Split('-').Length-2)] -join '-' # simplistic; fallback to full name
          $record = [ordered]@{ port=$p; container=$cname; project=$proj; ports=$ports }
          if($cname -notmatch $ProjectName){ $conflicts += $record }
        }
      }
    }
    if($conflicts.Count -gt 0){
      $results.conflicts.critical = $conflicts
      if(-not $Json){ Write-Warn ("Port conflicts detected: " + ($conflicts | ForEach-Object { "${($_.port)}:${($_.container)}" } -join ', ')) }
    } else {
      $results.conflicts.critical = @()
      if(-not $Json){ Write-Ok 'No critical port conflicts' }
    }
  } catch { if(-not $Json){ Write-Warn "Conflict scan failed: $_" } }
}

if(-not $SkipDns){
  try {
    Write-Info "DNS resolve $HostName"
    $dnsSw = [System.Diagnostics.Stopwatch]::StartNew()
    $ips = [System.Net.Dns]::GetHostAddresses($HostName) | Where-Object { $_.AddressFamily -eq 'InterNetwork' }
    $dnsSw.Stop()
    $results.dns = [ordered]@{ ok = ($ips.Count -gt 0); latency_ms = [int]$dnsSw.Elapsed.TotalMilliseconds; ipv4 = ($ips | ForEach-Object { $_.ToString() }) }
    if($ips.Count -eq 0 -and -not $Json){ Write-Warn "DNS resolve returned no A records" }
  } catch { $results.dns = [ordered]@{ ok=$false; error=$_.Exception.Message }; if(-not $Json){ Write-Err "DNS resolve failed: $($_.Exception.Message)" } }
}

Write-Info "Probing core health endpoints"
Invoke-Probe 'up' "$base/_up" $TimeoutSeconds | Out-Null
Invoke-Probe 'ready' "$base/ready" $TimeoutSeconds | Out-Null
Invoke-Probe 'healthz' "$base/api/healthz" $TimeoutSeconds | Out-Null
Invoke-Probe 'health_simple' "$base/health/simple" $TimeoutSeconds | Out-Null
Invoke-Probe 'live' "$base/api/live" $TimeoutSeconds | Out-Null
Invoke-Probe 'agui_ping' "$base/agui/ping" $TimeoutSeconds | Out-Null
Invoke-Probe 'llm_health' "$base/llm/health" $TimeoutSeconds | Out-Null

# Enhanced: Edge classification for critical subset
$edgeUrls = @(
  "$base/_up",
  "$base/api/healthz",
  "$base/api/ready",
  "$base/api/live"
)
$edgeProbes = @()
foreach($u in $edgeUrls){ $edgeProbes += Invoke-EdgeProbe -Url $u -TimeoutSec $TimeoutSeconds }
$results.endpoints.edge_classified = $edgeProbes
$results.local_tls = ($edgeProbes | Where-Object { $_.class -eq 'tls_local_stack' })

# --- BEGIN: Hardened header integrity (retry & Windows-friendly) ---
function Invoke-HeadCheck {
  param([Parameter(Mandatory=$true)][string]$Url)
  $isWin = $IsWindows -or ($PSStyle.Platform -eq 'Windows')
  $exe  = $isWin ? 'curl.exe' : 'curl'
  $curlArgs = @('-s','-S','-D','-','-H','Accept-Encoding: identity','-o','NUL', $Url)
  if($isWin){ $curlArgs = @('--ssl-no-revoke','--http1.1') + $curlArgs }
  $raw = & $exe @curlArgs 2>$null
  $first = ($raw -split "`r?`n")[0]
  $code  = ($first -replace '.*\s(\d{3}).*','$1')
  $hdrTuple = Get-HeaderMap $raw
  $map = $hdrTuple[0]; $dups = $hdrTuple[1]
  $clLine = $map['Content-Length']
  $clen = $null
  if ($clLine) {
    $trimmed = $clLine.Trim()
    if ($trimmed -match '^(\d+)$') { $clen = [int]$Matches[1] }
  }
  # Fallback: direct line scan if map approach failed (defensive)
  if ($null -eq $clen) {
    foreach($ln in ($raw -split "`r?`n")){
      if($ln -match '^(?i)Content-Length:\s*(\d+)\s*$'){ $clen = [int]$Matches[1]; break }
    }
  }
  $xfer = $map['Transfer-Encoding']; if($xfer){ $xfer = $xfer.ToLower() }
  $ctype = $map['Content-Type']
  [pscustomobject]@{
    url               = $Url
    code              = $code
    content_length    = $clen
    transfer_encoding = $xfer
    content_type      = $ctype
    has_length        = ($null -ne $clen -and $clen -gt 0)
    not_chunked       = ($null -eq $xfer -or $xfer -ne 'chunked')
    duplicates        = $dups
    raw               = $raw
  }
}

function Invoke-SseProbe {
  param([Parameter(Mandatory=$true)][string]$Url,[int]$TimeoutSec=6)
  $isWin = $IsWindows -or ($PSStyle.Platform -eq 'Windows')
  $exe   = $isWin ? 'curl.exe' : 'curl'
  $curlSseList  = @('-s','-S','-i','-N','--max-time',"$TimeoutSec",'-H','Accept: text/event-stream', $Url)
  if($isWin){ $curlSseList = @('--ssl-no-revoke','--http1.1') + $curlSseList }
  $raw = & $exe @curlSseList 2>$null
  $parts = $raw -split "`r?`n`r?`n", 2
  $hraw = $parts[0]
  $body = if($parts.Count -gt 1){ $parts[1] } else { '' }
  $code = (($hraw -split "`r?`n")[0] -replace '.*\s(\d{3}).*','$1')
  $hdrTuple = Get-HeaderMap $hraw; $map = $hdrTuple[0]
  $ctype = $map['Content-Type']
  $looksSse = ($ctype -match 'text/event-stream') -and ($body -match '^(data:|event:)')
  [pscustomobject]@{ url=$Url; code=$code; content_type=$ctype; first_bytes=$body.Substring(0,[Math]::Min($body.Length,64)); ok = ($code -eq '200' -and $looksSse) }
}
function Get-HealthzHeaders {
  param([string]$Url,[int]$Retry=3,[int]$Delay=5)
  $last = $null
  for($i=0;$i -lt $Retry;$i++){
    $h = Invoke-HeadCheck $Url
    $last = $h
    if($h.code -match '^(200|204)$' -and $h.has_length -and $h.not_chunked){ return $h }
    Start-Sleep -Seconds $Delay
  }
  return $last
}
$healthzBase = if ($base) { $base } elseif ($env:EDGE_BASE) { $env:EDGE_BASE } else { 'https://app.ledger-mind.org' }
$healthzUrl  = ($healthzBase.TrimEnd('/')) + '/api/healthz'
$headHealth = Get-HealthzHeaders -Url $healthzUrl -Retry $Retry -Delay $RetryDelaySec
if (-not $results.endpoints) { $results | Add-Member -Name endpoints -MemberType NoteProperty -Value @{} }
$results.endpoints.healthz_headers = $headHealth
$secKeys = @('Strict-Transport-Security','Referrer-Policy','Permissions-Policy','X-Content-Type-Options','X-Frame-Options','X-XSS-Protection','Content-Security-Policy')
if($headHealth -and $headHealth.PSObject.Properties.Name -contains 'duplicates'){
  $dupFound = @()
  foreach($k in $secKeys){ if($headHealth.duplicates -contains $k){ $dupFound += $k } }
  $results.endpoints.healthz_dup_headers = $dupFound
}
$ignoreHeaderCrit = $false
if ($results.local_tls) { $ignoreHeaderCrit = @($results.local_tls | Where-Object { $_.url -eq $healthzUrl }).Count -gt 0 }
if (-not $ignoreHeaderCrit) {
  if ($headHealth.code -ne '200')      { $results.summary.critical += 'healthz_header_http' }
  if (-not $headHealth.has_length)     { $results.summary.critical += 'healthz_missing_length' }
  if (-not $headHealth.not_chunked)    { $results.summary.critical += 'healthz_chunked' }
}
$results.summary.critical = @($results.summary.critical | Select-Object -Unique)
$results.critical = $results.summary.critical
# --- END: Hardened header integrity ---

# Parse /api/healthz JSON for reasons & crypto
try {
  $hzRaw = curl.exe -s "$base/api/healthz"
  if($hzRaw){
    $hz = $hzRaw | ConvertFrom-Json -ErrorAction Stop
    $results.endpoints.healthz.details = [ordered]@{
      status = $hz.status
      reasons = $hz.reasons
      crypto_mode = $hz.crypto_mode
      crypto_ready = $hz.crypto_ready
      alembic_in_sync = $hz.alembic.in_sync
      db_reachable = $hz.db.reachable
      models_ok = $hz.db.models_ok
    }
  }
} catch { Write-Warn "Failed to parse /api/healthz JSON: $_" }

# Agent models (optional detailed)
$modelsList = $null
try {
  $modelsRaw = curl.exe -s "$base/agent/models"
  if($modelsRaw){ $modelsList = $modelsRaw | ConvertFrom-Json }
} catch {}
if($modelsList){
  $ids = @()
  foreach($m in $modelsList.models){ $ids += $m.id }
  $results.llm.models = $ids
  $results.llm.provider = $modelsList.provider
  $results.llm.default = $modelsList.default
  if($VerboseModels){ Write-Info "Models: $($ids -join ', ')" }
} else {
  $results.llm.models_error = 'unavailable'
}

# LLM echo quick path
try {
  $echoBody = '{"prompt":"ping","model":"'+$PrimaryModel+'"}'
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  $echo = curl.exe -s -H "Content-Type: application/json" -d $echoBody "$base/llm/echo"
  $sw.Stop()
  if($echo){
    $results.llm.echo_latency_ms = [int]$sw.Elapsed.TotalMilliseconds
    $results.llm.echo_ok = $true
  } else { $results.llm.echo_ok = $false }
} catch { $results.llm.echo_ok = $false }

if($IncludeGenerate){
  Write-Info "Performing lightweight /api/generate ping"
  try {
    $genBody = '{"model":"'+$PrimaryModel+'","prompt":"ping","stream":false}'
    $swg = [System.Diagnostics.Stopwatch]::StartNew()
    $genResp = curl.exe -s -H "Content-Type: application/json" -d $genBody "$base/api/generate"
    $swg.Stop()
    $results.llm.generate_latency_ms = [int]$swg.Elapsed.TotalMilliseconds
    $results.llm.generate_sample = if($genResp.Length -gt 120){ $genResp.Substring(0,120) + '...' } else { $genResp }
    $results.llm.generate_ok = ($genResp -match 'response' -or $genResp -match 'choices')
    if(-not $results.llm.generate_ok){ $fail = $true }
  } catch { $results.llm.generate_ok = $false; $fail = $true }
}

# Tunnel metrics (cloudflared)
try {
  $metricsRaw = curl.exe -s "http://127.0.0.1:$TunnelMetricsPort/metrics"
  if($metricsRaw){
    $present = $false
    $haLines = @()
    foreach($line in ($metricsRaw -split "`n")){
      if($line -match '^cloudflared_tunnel_ha_connections '){ $present = $true; $haLines += $line }
    }
    $seriesVals = @()
    foreach($hl in $haLines){
      try { $seriesVals += [double]($hl -split ' ')[1] } catch {}
    }
    $minVal = if($seriesVals.Count -gt 0){ ($seriesVals | Measure-Object -Minimum).Minimum } else { 0 }
    $maxVal = if($seriesVals.Count -gt 0){ ($seriesVals | Measure-Object -Maximum).Maximum } else { 0 }
    $results.tunnel.metrics_present = $present
    $results.tunnel.ha_connection_series = $seriesVals
    $results.tunnel.ha_min = $minVal
    $results.tunnel.ha_max = $maxVal
    if(-not $present){
      $results.tunnel.status='no_metrics'
    } elseif($maxVal -lt $MinHaConnections){
      $results.tunnel.status='insufficient_connections'
      if(-not $Json){ Write-Warn "HA connections below threshold ($maxVal < $MinHaConnections)" }
    } else {
      $results.tunnel.status='ok'
    }
  } else {
    $results.tunnel.metrics_present = $false
    $results.tunnel.status='no_metrics'
    Write-Warn 'cloudflared metrics endpoint empty'
  }
} catch { Write-Warn "cloudflared metrics fetch failed: $_"; $results.tunnel.status='error' }

# TLS / Certificate expiry check (optional)
if($CertMinDays){
  Write-Info "Checking TLS certificate expiry (threshold ${CertMinDays}d)"
  $certInfo = Get-CertDaysRemaining -TargetHost $HostName
  $results.tls = $certInfo
}

# Summaries (modified to ignore tls_local_stack for critical computation)
$crit = @()
foreach($k in $results.endpoints.Keys){
  $entry = $results.endpoints[$k]
  if($entry -is [hashtable]){ if($entry.severity -eq 'critical'){ $crit += $k } }
}
# Add edge classified failures that are not tls_local_stack and not HTTP 200
$edgeCrit = $edgeProbes | Where-Object { @('200','204') -notcontains $_.http -and $_.class -ne 'tls_local_stack' } | ForEach-Object { $_.url }
if($edgeCrit){ $crit += $edgeCrit }
$warn = @($results.endpoints.GetEnumerator() | Where-Object { $_.Value.severity -eq 'warn' }).Name
$tunnelOk = ($results.tunnel.status -eq 'ok')
if($TunnelStrict){
  if(-not $tunnelOk){ $crit += 'tunnel' }
  if(($results.dns.ok -eq $false) -and -not $SkipDns){ $crit += 'dns' }
}
if($CertMinDays -and ($results.tls.Keys -contains 'days_remaining')){
  if($results.tls['days_remaining'] -lt $CertMinDays){ $crit += 'cert_expiring' }
}
$results.summary = [ordered]@{
  critical = $crit
  warnings = $warn
  ok = ($crit.Count -eq 0 -and -not $fail)
}

# Optional SSE probe (adds warning if fails but not critical)
if($SseProbe){
  $sseBase = $base
  $sseFull = ($sseBase.TrimEnd('/')) + $SseUrl
  $sse = Invoke-SseProbe -Url $sseFull -TimeoutSec $SseTimeoutSec
  $results.endpoints.sse = $sse
  if(-not $sse.ok){
    if($sse.code -eq '404'){
      if(-not $Json){ Write-Info "SSE endpoint $sseFull absent (404) — skipping warning" }
    } else {
      $currentWarn = @()
      if($results.summary.warnings){ $currentWarn = @($results.summary.warnings) }
      $currentWarn += 'sse_probe_failed'
      $results.summary.warnings = @($currentWarn | Select-Object -Unique)
      if(-not $Json){ Write-Warn "SSE probe failed ($($sse.code)) on $sseFull" }
    }
  }
}

# Schema-aligned convenience aliases (non-breaking): timestamp, probes, critical array
$probes = @{}
foreach($k in 'up','ready','healthz'){
  if($results.endpoints.ContainsKey($k)){
    $codeStr = $results.endpoints[$k].code
    $codeInt = 0
    [int]::TryParse($codeStr,[ref]$codeInt) | Out-Null
    $probes[$k] = $codeInt
  }
}
$results.timestamp = $results.ts
$results.probes = $probes
$results.critical = $results.summary.critical

if($Json){
  $results | ConvertTo-Json -Depth 6
} else {
  if($results.summary.ok){ Write-Ok 'All critical checks passed' } else { Write-Err "Critical failures: $($crit -join ', ')" }
  Write-Info "Warnings: $($warn -join ', ')"
  if($results.local_tls){ Write-Warn ("Local TLS stack issues detected: " + ($results.local_tls | ForEach-Object { $_.url } -join ', ')) }
}

if(-not $results.summary.ok){ exit 2 }

# Optional Prometheus metrics emission
if($EmitPromMetrics){
  try {
    $h = $results.endpoints.healthz_headers
    $ok = ($h -and $h.code -eq '200' -and $h.has_length -and $h.not_chunked) ? 1 : 0
    $contentLength = if($h.content_length){ $h.content_length } else { 0 }
    $lines = @(
      '# HELP edge_healthz_ok 1 if edge /api/healthz is healthy',
      '# TYPE edge_healthz_ok gauge',
      "edge_healthz_ok $ok",
      '# HELP edge_healthz_content_length Content-Length reported by edge for /api/healthz',
      '# TYPE edge_healthz_content_length gauge',
      "edge_healthz_content_length $contentLength"
    ) -join "`n"
    $dir = Join-Path -Path (Resolve-Path .) -ChildPath 'ops/metrics'
    if(-not (Test-Path $dir)){ New-Item -ItemType Directory -Path $dir | Out-Null }
    Set-Content -Path (Join-Path $dir 'edge.prom') -Value $lines -NoNewline
  } catch {
    if(-not $Json){ Write-Warn "Failed to emit Prometheus metrics: $_" }
  }
}
