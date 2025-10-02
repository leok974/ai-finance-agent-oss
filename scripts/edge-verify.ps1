param(
  [string]$HostUrl = "https://app.ledger-mind.org",
  [string]$MetricsFile = "ops/metrics/edge.prom",
  [switch]$AuthTest,
  [switch]$Json
)

$UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0 Safari/537.36 edge-probe'

$ErrorActionPreference = "Stop"

function Parse-HeaderMap([string]$Raw) {
  $map = @{}
  if (-not $Raw) { return $map }
  foreach ($line in ($Raw -split "`r?`n")) {
    if ($line -match '^HTTP/') { continue }
    if ($line -notmatch ':') { continue }
    $kv = $line -split ":\s*", 2
    if ($kv.Count -ne 2) { continue }
    $k = $kv[0].Trim().ToLower()
    $v = $kv[1].Trim()
    if ($map.ContainsKey($k)) { $map[$k] = @($map[$k]) + $v } else { $map[$k] = $v }
  }
  return $map
}
function Get-LastHeaderMap {
  param(
    [Parameter(Mandatory=$true)][string]$Url,
    [ValidateSet("HEAD","GET")]$Method="HEAD",
    [int]$TimeoutSec=15
  )
  # Strategy: for header reliability we do a dedicated header fetch (-D - -o NUL) then separate body fetch if GET.
  $headerRaw = & curl.exe --ssl-no-revoke --http1.1 -H "User-Agent: $UA" -sSL -D - -o NUL --max-time $TimeoutSec $Url 2>$null
  # Split into potential multiple blocks (redirect chain); keep last block starting with HTTP/
  $candidates = ($headerRaw -split '(?=HTTP/)') | Where-Object { $_ -match '^HTTP/' }
  $lastBlock = if ($candidates.Count -gt 0) { $candidates[-1] } else { $headerRaw }
  # Truncate at first blank line to remove any accidental body leakage
  # Use non-capturing group so split does not inject delimiter tokens, preserving all header lines
  $headerOnly = ($lastBlock -split "(?:`r?`n){2,}")[0]
  $map = Parse-HeaderMap $headerOnly
  $body = $null
  if ($Method -eq 'GET') {
    # Separate body fetch (final location, follow redirects)
    $body = & curl.exe --ssl-no-revoke --http1.1 -H "User-Agent: $UA" -sSL --max-time $TimeoutSec $Url 2>$null
  }
  return @{ raw=$headerOnly; map=$map; body=$body }
}
function HeadThenGetHeaders([string]$Url, [int]$TimeoutSec=15, [string]$UA='Mozilla/5.0') {
  # 1) HEAD
  $h1 = Get-LastHeaderMap -Url $Url -Method "HEAD" -TimeoutSec $TimeoutSec
  $map = $h1.map; $raw = $h1.raw; $via = "head"
  if (-not $map['content-type'] -or -not $map['content-length']) {
    # 2) GET headers only
    $h2 = Get-LastHeaderMap -Url $Url -Method "GET" -TimeoutSec $TimeoutSec
    $map = $h2.map; $raw = $h2.raw; $via = "get"
    if (-not $map['content-type'] -and -not $map['content-length']) {
      # 3) Identity encoding to avoid br/gzip quirks
      $raw3 = & curl.exe --ssl-no-revoke --http1.1 -sSL -D - -o NUL -H "User-Agent: $UA" -H "Accept-Encoding: identity" --max-time $TimeoutSec $Url
      $map = Parse-HeaderMap $raw3; $raw = $raw3; $via = "get+identity"
    }
  }
  return @{ map=$map; raw=$raw; via=$via }
}
function HttpCode([string]$Url, [int]$TimeoutSec=15, [int]$Retries=0, [int]$DelayMs=250, [string]$UA='Mozilla/5.0') {
  $code = & curl.exe --ssl-no-revoke --http1.1 -H "User-Agent: $UA" -s -o NUL -w "%{http_code}" --max-time $TimeoutSec $Url
  for ($i=0; $i -lt $Retries -and ($code -eq '000' -or $code -eq '0' -or $code -eq '504'); $i++) {
    Start-Sleep -Milliseconds $DelayMs
    $code = & curl.exe --ssl-no-revoke --http1.1 -H "User-Agent: $UA" -s -o NUL -w "%{http_code}" --max-time $TimeoutSec $Url
  }
  return $code
}

# 1) Index (GET+redirect) + HTML (final response only)
$idxHdrObj = Get-LastHeaderMap -Url $HostUrl -Method 'GET' -TimeoutSec 15
$idxHdr    = $idxHdrObj.map
$indexHtml = $idxHdrObj.body

# 2) Asset paths from live index (match until next double quote)
$jsPath  = ($indexHtml | Select-String -Pattern '/assets/[^" ]+\.js'  -AllMatches).Matches.Value | Select-Object -First 1
$cssPath = ($indexHtml | Select-String -Pattern '/assets/[^" ]+\.css' -AllMatches).Matches.Value | Select-Object -First 1

# 3) Asset header probes with fallbacks
$jsProbe  = if ($jsPath)  { HeadThenGetHeaders ($HostUrl + $jsPath) 15 $UA } else { @{map=@{};via=$null;raw=$null} }
$cssProbe = if ($cssPath) { HeadThenGetHeaders ($HostUrl + $cssPath) 15 $UA } else { @{map=@{};via=$null;raw=$null} }

# Coalesce header values and capture raw (truncated)
$jsCT   = (@($jsProbe.map['content-type'])   -join ', ')
$cssCT  = (@($cssProbe.map['content-type'])  -join ', ')
$jsLen  = (@($jsProbe.map['content-length']) -join ', ')
$cssLen = (@($cssProbe.map['content-length'])-join ', ')
# Normalize raw header arrays to joined strings before truncation
$jsRaw = if ($jsProbe.raw) {
  # Normalize to single multiline string first (curl output often captured as string[])
  $rawObj = $jsProbe.raw
  if ($rawObj -is [System.Array]) { $rawStr = ($rawObj -join "`n") } else { $rawStr = [string]$rawObj }
  if ($rawStr.Length -gt 800) { $rawStr.Substring(0,800) } else { $rawStr }
} else { $null }
$cssRaw = if ($cssProbe.raw) {
  $rawObj2 = $cssProbe.raw
  if ($rawObj2 -is [System.Array]) { $rawStr2 = ($rawObj2 -join "`n") } else { $rawStr2 = [string]$rawObj2 }
  if ($rawStr2.Length -gt 800) { $rawStr2.Substring(0,800) } else { $rawStr2 }
} else { $null }
# --- MIME / LENGTH RECOVERY FROM RAW HEADER BLOCKS ---
if (-not $jsCT -and $jsRaw) { $m = [regex]::Match($jsRaw, '(?im)^\s*Content-Type\s*:\s*([^\r\n]+)'); if ($m.Success) { $jsCT  = $m.Groups[1].Value.Trim() } }
if (-not $cssCT -and $cssRaw) { $m = [regex]::Match($cssRaw,'(?im)^\s*Content-Type\s*:\s*([^\r\n]+)'); if ($m.Success) { $cssCT = $m.Groups[1].Value.Trim() } }
if (-not $jsLen -and $jsRaw) { $m = [regex]::Match($jsRaw, '(?im)^\s*Content-Length\s*:\s*([0-9]+)'); if ($m.Success) { $jsLen  = $m.Groups[1].Value.Trim() } }
if (-not $cssLen -and $cssRaw) { $m = [regex]::Match($cssRaw,'(?im)^\s*Content-Length\s*:\s*([0-9]+)'); if ($m.Success) { $cssLen = $m.Groups[1].Value.Trim() } }
$jsTE=$null; $cssTE=$null
if ($jsRaw)  { $m=[regex]::Match($jsRaw, '(?im)^\s*Transfer-Encoding\s*:\s*([^\r\n]+)'); if ($m.Success) { $jsTE  = $m.Groups[1].Value.Trim() } }
if ($cssRaw) { $m=[regex]::Match($cssRaw,'(?im)^\s*Transfer-Encoding\s*:\s*([^\r\n]+)'); if ($m.Success) { $cssTE = $m.Groups[1].Value.Trim() } }
# --- END RECOVERY ---

# Recompute OK / soft OK (chunked counts as soft when MIME absent)
$jsMimeOK  = ($null -ne $jsPath)  -and ($jsCT  -match 'application/(javascript|x-javascript)')
$cssMimeOK = ($null -ne $cssPath) -and ($cssCT -match '^text/css($|;)')
[int]$t=0
$jsSoftOK  = ($null -ne $jsPath)  -and (-not $jsMimeOK)  -and ( ([int]::TryParse(($jsLen|Out-String).Trim(), [ref]$t) -and $t -gt 0) -or ($jsTE  -match 'chunked') )
[int]$u=0
$cssSoftOK = ($null -ne $cssPath) -and (-not $cssMimeOK) -and ( ([int]::TryParse(($cssLen|Out-String).Trim(), [ref]$u) -and $u -gt 0) -or ($cssTE -match 'chunked') )

# 4) CSP header or meta (both count) with case-insensitive detection
$cspHeader = $false
$cspHeaderValue = $null
$rawHeadersForCSP = $idxHdrObj.raw
if ($rawHeadersForCSP) {
  # If multiple HTTP/ blocks somehow remain, keep only last
  $blocksTmp = ($rawHeadersForCSP -split '(?=HTTP/)') | Where-Object { $_ -match '^HTTP/' }
  if ($blocksTmp.Count -gt 0) { $rawHeadersForCSP = $blocksTmp[-1] }
  $cspLine = ($rawHeadersForCSP -split "`r?`n") | Where-Object { $_ -match '^(?i)content-security-policy\s*:' } | Select-Object -First 1
  if ($cspLine) {
    $cspHeader = $true
    $cspHeaderValue = ($cspLine -split ':',2)[1].Trim()
  }
}
$cspMeta = $false
if ($indexHtml) {
  $cspMeta = [bool]([regex]::IsMatch($indexHtml, '(?is)<meta[^>]+http-equiv\s*=\s*["'']content-security-policy["'']'))
}
$cspPresent = $cspHeader -or $cspMeta
$cspNote = if ($cspHeader -and $cspMeta) { 'both' } elseif ($cspHeader) { 'header' } elseif ($cspMeta) { 'meta' } else { 'absent' }

# Fallback: if header still undetected, use .NET HttpClient (robust against line wrapping)
if (-not $cspHeader) {
  try {
    $handler = [System.Net.Http.HttpClientHandler]::new()
    $client  = [System.Net.Http.HttpClient]::new($handler)
    $client.Timeout = [TimeSpan]::FromSeconds(15)
    $client.DefaultRequestHeaders.UserAgent.ParseAdd($UA)
    $respMsg = $client.GetAsync($HostUrl).GetAwaiter().GetResult()
    if ($respMsg -and $respMsg.Headers -and $respMsg.Headers.Contains('Content-Security-Policy')) {
      $vals = $respMsg.Headers.GetValues('Content-Security-Policy')
      if ($vals) {
        $cspHeader = $true
        $cspHeaderValue = ($vals -join ', ')
        $cspPresent = $true
        if ($cspMeta) { $cspNote = 'both' } else { $cspNote = 'header' }
      }
    }
  } catch { }
}

# 4b) Policy length + SHA256 hash (stable change detector)
function Get-StringSHA256([string]$s) {
  if (-not $s) { return "" }
  $sha = [System.Security.Cryptography.SHA256]::Create()
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($s)
  ($sha.ComputeHash($bytes) | ForEach-Object { $_.ToString('x2') }) -join ''
}
$cspPolicyLen = if ($cspHeaderValue) { $cspHeaderValue.Length } else { 0 }
$cspPolicySha = if ($cspHeaderValue) { Get-StringSHA256 $cspHeaderValue } else { '' }

# 5) Core endpoints with healthz retry + transient detection
$healthz1 = [int](HttpCode "$HostUrl/api/healthz" 15 1 250 $UA)
$ready    = [int](HttpCode "$HostUrl/api/ready"   15 0 250 $UA)
$live     = [int](HttpCode "$HostUrl/api/live"    15 0 250 $UA)
$up       = [int](HttpCode "$HostUrl/_up"         15 0 250 $UA)
$healthz2 = if ($healthz1 -ne 200) { [int](HttpCode "$HostUrl/api/healthz" 15 1 350 $UA) } else { $healthz1 }
$healthz  = $healthz2
$healthz_transient = ($healthz1 -eq 504 -and $healthz2 -eq 200)

# 6) Auth (simple; treat 401 as non-critical "challenge")
$auth = @{ ok=$false; challenged=$null; mode=$null; exit_code=$null; note="not-run" }
if ($AuthTest) {
  try {
    $authRaw = pwsh -NoProfile -File "scripts/test-auth.ps1" -HostUrl $HostUrl 2>&1
    $authObj = $null; try { $authObj = $authRaw | ConvertFrom-Json } catch {}
    if ($authObj) { $auth = $authObj }
    else { $auth.ok=$false; $auth.mode="unknown"; $auth.exit_code=1; $auth.note="auth-json-parse-fail" }
  } catch {
    $auth.ok=$false; $auth.mode="exception"; $auth.exit_code=1; $auth.note="auth-exception: $($_.Exception.Message)"
  }
} else {
  try {
    $me = [int](HttpCode "$HostUrl/api/auth/me")
    if     ($me -eq 200) { $auth.ok=$true;  $auth.challenged=$false; $auth.mode="session";   $auth.note="me:200" }
    elseif ($me -eq 401) { $auth.ok=$false; $auth.challenged=$true;  $auth.mode="challenge"; $auth.exit_code=$me; $auth.note="me:401" }
    else                 { $auth.ok=$false; $auth.challenged=$null;  $auth.mode="unknown";   $auth.exit_code=$me; $auth.note="me:$me" }
  } catch {
    $auth.ok=$false; $auth.mode="exception"; $auth.exit_code=1; $auth.note="auth-exception: $($_.Exception.Message)"
  }
}

# 7) Summary with healthz transient + soft asset logic
$warn = @()
if ($jsSoftOK -or $cssSoftOK) { $warn += 'asset_mime_missing' }
$critical = @()
if ((-not $jsMimeOK -and -not $jsSoftOK) -or (-not $cssMimeOK -and -not $cssSoftOK)) { $critical += 'assets' }
if (($ready -ne 200) -or ($healthz -ne 200 -and -not $healthz_transient)) { $critical += 'core' } elseif ($healthz_transient) { $warn += 'core_transient' }
if (-not $auth.ok -and -not $auth.challenged) { $critical += 'auth' } elseif ($auth.challenged) { $warn += 'auth_challenge' }

$out=[pscustomobject]@{
  host=$HostUrl
  index=@{ csp_present=$cspPresent; csp_header=$cspHeader; csp_meta=$cspMeta; csp_note=$cspNote; csp_header_value=$cspHeaderValue; hdr_via="get+redirect" }
  assets=@{ js_path=$jsPath; css_path=$cssPath; js_ct=$jsCT; css_ct=$cssCT; js_len=$jsLen; css_len=$cssLen; js_via=$jsProbe.via; css_via=$cssProbe.via; js_mime_ok=$jsMimeOK; css_mime_ok=$cssMimeOK; js_soft_ok=$jsSoftOK; css_soft_ok=$cssSoftOK; js_te=$jsTE; css_te=$cssTE; js_hdr_raw=$jsRaw; css_hdr_raw=$cssRaw }
  endpoints=@{ healthz=$healthz; ready=$ready; live=$live; up=$up; healthz_transient=$healthz_transient }
  auth=$auth
  summary=@{ ok=($critical.Count -eq 0); critical=$critical; warn=$warn }
}

# 8) Metrics (finalized semantics) hard + soft + success + OS exit code
$assetsHardOK = [int]([bool]($jsMimeOK -and $cssMimeOK))
$assetsSoftOK = [int]([bool]($jsSoftOK -or $cssSoftOK))
$successFlag  = [int]([bool]$out.summary.ok)    # 1 = success, 0 = failure
$exitOS       = (1 - $successFlag)              # 0 = success, 1 = failure (OS semantics)
@"
edge_assets_ok $assetsHardOK
edge_assets_soft_ok $assetsSoftOK
edge_csp_present $([int]([bool]$cspPresent))
edge_csp_header $([int]([bool]$cspHeader))
edge_csp_meta $([int]([bool]$cspMeta))
edge_csp_policy_length $cspPolicyLen
edge_csp_policy_sha{sha="$cspPolicySha"} 1
edge_auth_ok $([int]([bool]$auth.ok))
edge_auth_challenged $([int]([bool]$auth.challenged))
edge_probe_success $successFlag
edge_probe_exit_code_os $exitOS
"@ | Out-File -Encoding ascii -FilePath $MetricsFile

# Optional push to backend edge metrics ingestion endpoint
try {
  $pushUrl = $env:EDGE_PUSH_URL
  if ($pushUrl) {
    $payload = @{ csp_policy_len = $cspPolicyLen; csp_policy_sha256 = $cspPolicySha }
    $jsonPayload = $payload | ConvertTo-Json -Compress
    $headers = @{"Content-Type"="application/json"}
    if ($env:EDGE_METRICS_TOKEN) { $headers['X-Edge-Token'] = $env:EDGE_METRICS_TOKEN }
    $resp = Invoke-WebRequest -Uri $pushUrl -Method POST -TimeoutSec 15 -Body $jsonPayload -Headers $headers -UseBasicParsing -ErrorAction Stop
    # Treat 204/200 as success; ignore others silently to avoid failing primary probe
  }
} catch {
  # swallow errors (network/auth) to keep probe success semantics pure
}

if ($Json) { $out | ConvertTo-Json -Depth 6 } else { $out }
if (-not $out.summary.ok) { exit 1 } else { exit 0 }
