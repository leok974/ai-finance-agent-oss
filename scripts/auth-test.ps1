<#
.SYNOPSIS
  End-to-end authentication flow test against deployed backend.
.DESCRIPTION
  Performs (optionally) register, login, status check, protected refresh (with CSRF), logout, and post-logout auth status negative test.
  Emits structured JSON summary + Prometheus-style metrics (optional) and sets exit code != 0 on failure.

  Cookie-based auth semantics:
    - /auth/login issues access_token (short) + refresh_token (long) HttpOnly cookies and csrf_token (non-HttpOnly)
    - /auth/refresh requires X-CSRF-Token header matching csrf_token cookie.

.PARAMETER BaseUrl
  Base URL of backend (scheme+host[:port]). Default https://localhost
.PARAMETER Email
  Email to use for test user. A random suffix is appended unless -StaticEmail specified.
.PARAMETER Password
  Password to use (plaintext). Default: P@ssw0rd123!
.PARAMETER StaticEmail
  Use the provided Email verbatim (no randomization). Useful if user already exists.
.PARAMETER Register
  Attempt registration first (default). Disable to skip register step.
.PARAMETER MetricsPath
  Optional path to write Prometheus textfile metrics (auth_test_*).
.PARAMETER Quiet
  Suppress info output (only errors + final JSON).
.PARAMETER Insecure
  Skip TLS revocation (adds curl --ssl-no-revoke) / ignore cert errors if you adapt curl opts.

.EXITCODES
  0 all steps succeeded
  10 register failed (unexpected)
  20 login failed
  30 status (pre) failed
  40 refresh failed
  50 logout failed
  60 post-logout status unexpected success
  70 internal script error

.EXAMPLES
  powershell -File scripts/auth-test.ps1 -BaseUrl https://my.app.domain -Email probe@example.com -StaticEmail
  powershell -File scripts/auth-test.ps1 -BaseUrl https://localhost -Register:$false -Email existing@example.com -StaticEmail
#>
[CmdletBinding()] param(
  [string]$BaseUrl = "https://localhost",
  [string]$Email = "probe@example.com",
  # Test-only password (non-secret). For stronger hygiene convert to SecureString if needed.
  [string]$Password = "P@ssw0rd123!",
  [switch]$StaticEmail,
  [switch]$Register, # default false; presence enables register
  [string]$MetricsPath,
  [switch]$Quiet,
  [switch]$Insecure
)

$ErrorActionPreference = 'Stop'

function Write-Info($msg) { if(-not $Quiet) { Write-Host "[auth-test] $msg" } }
function Write-ErrJsonAndExit($code, $summary) {
  $json = $summary | ConvertTo-Json -Depth 6
  Write-Host $json
  exit $code
}

# Compose test email if not static
if(-not $StaticEmail) { $rand = -join ((65..90)+(97..122)+48..57 | Get-Random -Count 6 | ForEach-Object {[char]$_}); $Email = "$Email+$rand" }

# Curl base args
$curl = "curl"
$cookieFile = Join-Path ([IO.Path]::GetTempPath()) ("authtest_" + [guid]::NewGuid().ToString() + ".cookies")
$common = @("-sS", "--fail", "--show-error", "-H", "Accept: application/json", "-H", "Content-Type: application/json", "-c", $cookieFile, "-b", $cookieFile)
${isWinLocal} = $IsWindows -or ($PSStyle.Platform -eq 'Windows')
if($Insecure -or $isWinLocal){ $common = @('--ssl-no-revoke') + $common }

# We'll manually round-trip cookies: capture stdout headers/body separately using -D -
function Invoke-CurlJson {
  param([string]$Method, [string]$Url, [string]$BodyJson, [hashtable]$ExtraHeaders, [string]$InCookies, [switch]$ReturnAll)
  # Method should be POST/GET etc; build -X only if provided
  $isWin = $IsWindows -or ($PSStyle.Platform -eq 'Windows')
  $exe = $isWin ? 'curl.exe' : 'curl'
  $argsList = @()
  if($Method){ $argsList += @('-X', $Method) }
  $argsList += $common
  if($BodyJson) { $argsList += @('--data', $BodyJson) }
  if($ExtraHeaders) { foreach($k in $ExtraHeaders.Keys){ $argsList += @('-H', ("{0}: {1}" -f $k, $ExtraHeaders[$k])) } }
  if($InCookies) { $argsList += @('-b', $InCookies) }
  # Use --dump-header to capture headers (temp file)
  $tmpH = New-TemporaryFile
  $argsList += @('--dump-header', $tmpH.FullName)
  $argsList += @($Url)
  $outRaw = & $exe @argsList 2>&1
  $code = $LASTEXITCODE
  # Normalize output to single string
  if($outRaw -is [array]){ $out = ($outRaw | ForEach-Object { $_.ToString() }) -join "`n" } else { $out = $outRaw.ToString() }
  $rawHeaders = ''
  if(Test-Path $tmpH.FullName){ $rawHeaders = Get-Content $tmpH.FullName -Raw }
  Remove-Item $tmpH -Force -ErrorAction SilentlyContinue
  $cookies = ($rawHeaders -split "`n") | Where-Object { $_ -match '^Set-Cookie:' }
  $cookieJar = @{}
  foreach($c in $cookies){
    if($c -match '^Set-Cookie:\s*([^=]+)=([^;]+)'){ $cookieJar[$matches[1]] = $matches[2] }
  }
  $json = $null
  $outStr = ($out | Out-String).Trim()
  if($outStr -and $outStr.StartsWith('{')) { try { $json = $outStr | ConvertFrom-Json -ErrorAction SilentlyContinue } catch {} }
  if($ReturnAll){ return [pscustomobject]@{ Code=$code; Raw=$out; Headers=$rawHeaders; Cookies=$cookieJar; Json=$json } }
  return $json
}

$results = [ordered]@{
  base_url = $BaseUrl
  email = $Email
  register = $null
  login = $null
  status_pre = $null
  refresh = $null
  logout = $null
  status_post = $null
  ok = $false
  ts = [DateTime]::UtcNow.ToString('o')
}

$cookieState = @{}
function Merge-Cookies($new){ if($new){ foreach($k in $new.Keys){ $cookieState[$k] = $new[$k] } } }
function Get-CookieHeader {
  if($cookieState.Count -eq 0){ return $null }
  return ($cookieState.GetEnumerator() | ForEach-Object { ("{0}={1}" -f $_.Key, $_.Value) }) -join '; '
}

# Step 1: Register (optional)
if($Register){
  Write-Info "Registering user $Email"
  $body = @{ email=$Email; password=$Password; roles=@('user') } | ConvertTo-Json -Compress
  try {
  $reg = Invoke-CurlJson -Method 'POST' -Url "$BaseUrl/auth/register" -BodyJson $body -ReturnAll
    if($reg.Code -eq 0 -and $reg.Json){
      Merge-Cookies $reg.Cookies
      $results.register = @{ success=$true; issued=($null -ne $reg.Json.access_token) }
    } else {
      # Might already exist -> fallback to treat as non-fatal if 400 Email already registered
      $results.register = @{ success=$false; error=$reg.Raw }
    }
  } catch {
    $results.register = @{ success=$false; error=$_.Exception.Message }
  }
}

# Step 2: Login (always attempt to ensure fresh cookies)
Write-Info "Logging in"
$bodyLogin = @{ email=$Email; password=$Password } | ConvertTo-Json -Compress
try {
  $login = Invoke-CurlJson -Method 'POST' -Url "$BaseUrl/auth/login" -BodyJson $bodyLogin -ReturnAll
  if($login.Code -eq 0 -and $login.Json){
    Merge-Cookies $login.Cookies
    $results.login = @{ success=$true; access_token_present=($null -ne $cookieState['access_token']) }
  } else {
    $results.login = @{ success=$false; error=$login.Raw }
    Write-ErrJsonAndExit 20 $results
  }
} catch {
  $results.login = @{ success=$false; error=$_.Exception.Message }
  Write-ErrJsonAndExit 20 $results
}

# Step 3: Auth status (pre)
Write-Info "Checking /auth/status (pre)"
try {
  $cookieHeader = Get-CookieHeader
  $statusPre = Invoke-CurlJson -Method 'GET' -Url "$BaseUrl/auth/status" -ExtraHeaders @{ 'Cookie' = $cookieHeader } -ReturnAll
  if($statusPre.Code -eq 0 -and $statusPre.Json.ok -eq $true){
    Merge-Cookies $statusPre.Cookies
    $results.status_pre = @{ success=$true }
  } else { $results.status_pre = @{ success=$false; error=$statusPre.Raw }; Write-ErrJsonAndExit 30 $results }
} catch { $results.status_pre = @{ success=$false; error=$_.Exception.Message }; Write-ErrJsonAndExit 30 $results }

# Step 4: Refresh (needs CSRF)
Write-Info "Refreshing token"
$csrf = $cookieState['csrf_token']
if(-not $csrf){ Write-Info "No csrf_token cookie present; proceeding but will likely fail" }
try {
  $cookieHeader = Get-CookieHeader
  $refresh = Invoke-CurlJson -Method 'POST' -Url "$BaseUrl/auth/refresh" -ExtraHeaders @{ 'Cookie' = $cookieHeader; 'X-CSRF-Token' = $csrf } -ReturnAll
  if($refresh.Code -eq 0 -and $refresh.Json.access_token){
    Merge-Cookies $refresh.Cookies
    $results.refresh = @{ success=$true }
  } else { $results.refresh = @{ success=$false; error=$refresh.Raw }; Write-ErrJsonAndExit 40 $results }
} catch { $results.refresh = @{ success=$false; error=$_.Exception.Message }; Write-ErrJsonAndExit 40 $results }

# Step 5: Logout
Write-Info "Logging out"
try {
  $cookieHeader = Get-CookieHeader
  $logout = Invoke-CurlJson -Method 'POST' -Url "$BaseUrl/auth/logout" -ExtraHeaders @{ 'Cookie' = $cookieHeader; 'X-CSRF-Token' = $cookieState['csrf_token'] } -ReturnAll
  if($logout.Code -eq 0 -and $logout.Json.ok -eq $true){
    Merge-Cookies $logout.Cookies
    $results.logout = @{ success=$true }
  } else { $results.logout = @{ success=$false; error=$logout.Raw }; Write-ErrJsonAndExit 50 $results }
} catch { $results.logout = @{ success=$false; error=$_.Exception.Message }; Write-ErrJsonAndExit 50 $results }

# Step 6: Status after logout should fail
Write-Info "Checking /auth/status post-logout (expect failure)"
try {
  $cookieHeader = Get-CookieHeader
  $statusPost = Invoke-CurlJson -Method 'GET' -Url "$BaseUrl/auth/status" -ExtraHeaders @{ 'Cookie' = $cookieHeader } -ReturnAll
  if($statusPost.Code -eq 0 -and $statusPost.Json.ok -eq $true){
    $results.status_post = @{ success=$false; unexpected_success=$true }
    Write-ErrJsonAndExit 60 $results
  } else {
    $results.status_post = @{ success=$true; expected_unauthorized=$true }
  }
} catch {
  # If curl fails (likely 401), treat as expected success
  $results.status_post = @{ success=$true; expected_unauthorized=$true }
}

$results.ok = $true

# Metrics emission (optional)
if($MetricsPath){
  $lines = @(
    "# HELP auth_test_ok Overall auth test success (1=ok)",
    "# TYPE auth_test_ok gauge",
    "auth_test_ok 1",
    "# HELP auth_test_step_success Step success flags",
    "# TYPE auth_test_step_success gauge",
  ('auth_test_step_success{step="login"} ' + ([int]$results.login.success)),
  ('auth_test_step_success{step="status_pre"} ' + ([int]$results.status_pre.success)),
  ('auth_test_step_success{step="refresh"} ' + ([int]$results.refresh.success)),
  ('auth_test_step_success{step="logout"} ' + ([int]$results.logout.success)),
  ('auth_test_step_success{step="status_post"} ' + ([int]$results.status_post.success))
  )
  try { $dir = Split-Path $MetricsPath -Parent; if($dir -and -not (Test-Path $dir)){ New-Item -ItemType Directory -Path $dir | Out-Null }; $lines -join "`n" | Out-File -FilePath $MetricsPath -Encoding utf8 } catch { Write-Info "Failed to write metrics: $($_.Exception.Message)" }
}

$results | ConvertTo-Json -Depth 6 | Write-Host
exit 0
