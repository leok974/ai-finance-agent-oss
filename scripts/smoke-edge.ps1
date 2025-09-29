<#!
  Unified edge smoke test.
  Usage examples:
    pwsh ./scripts/smoke-edge.ps1
    pwsh ./scripts/smoke-edge.ps1 -Base https://app.ledger-mind.org -Debug
  Exit codes: 0 = success, 2 = one or more checks failed.
!>
#>

param(
  [string]$Base = "https://app.ledger-mind.org",
  [switch]$Debug,
  [switch]$SkipHelp,
  [switch]$SkipRedirects
)

$ErrorActionPreference = 'Stop'
$script:FAIL = $false
$IsWin = $PSVersionTable.OS -match 'Windows' -or $env:OS -match 'Windows'
$NullSink = if ($IsWin) { 'NUL' } else { '/dev/null' }

function _ok($cond, $msg) {
  if ($cond) { Write-Host "[PASS] $msg" -ForegroundColor Green }
  else { Write-Host "[FAIL] $msg" -ForegroundColor Red; $script:FAIL = $true }
}

function CurlHead($u) {
  $r = curl --ssl-no-revoke -sI $u 2>&1; $ec=$LASTEXITCODE
  if ($ec -ne 0) { Write-Host "[curl-fail] exit=$ec url=$u" -ForegroundColor Yellow; Write-Host $r }
  return $r
}

$ts = [int][double]::Parse((Get-Date -UFormat %s))
Write-Host "[edge-smoke] Base=$Base ts=$ts" -ForegroundColor Cyan

# Helper to fetch only status code reliably
function GetStatus($method, $url, $headers=@(), $body=$null){
  $curlArgs = @('--ssl-no-revoke','-sk','-o',$NullSink,'-w','%{http_code}')
  foreach($h in $headers){ $curlArgs += @('-H', $h) }
  if($method -ne 'GET'){ $curlArgs += @('-X', $method) }
  if($body){ $curlArgs += @('-d', $body) }
  $curlArgs += $url
  $out = & curl @curlArgs 2>&1
  if($LASTEXITCODE -ne 0){ Write-Host "[curl-fail] ($method $url) exit=$LASTEXITCODE" -ForegroundColor Yellow; Write-Host $out; return '' }
  return ($out | Select-Object -Last 1)
}

# 1) /_up (expect 204)
$upCode = GetStatus GET "$Base/_up?__nocache=$ts"
_ok ($upCode -eq '204') "/_up -> $upCode (expect 204)"

# 2) /version JSON shape
$versionUrl = "$Base/version?__nocache=$ts"
        $versionBody = curl --ssl-no-revoke --compressed -sk -H "Accept: application/json" $versionUrl 2>$null
# Split headers/body at first blank line
        try { $versionObj = if($versionBody){ $versionBody | ConvertFrom-Json } else { $null } } catch { $versionObj = $null }
        if(-not $versionObj){
          $len = if($versionBody){ $versionBody.Length } else { 0 }
          Write-Host "[diag] /version raw len=$len" -ForegroundColor Yellow
          if($len -gt 0){
            try {
              $snippetLen = [Math]::Min(240,[Math]::Max(1,$versionBody.Length))
              if($snippetLen -gt $versionBody.Length){ $snippetLen = $versionBody.Length }
              Write-Host ($versionBody.Substring(0,$snippetLen)) -ForegroundColor Yellow
              $bytes = [System.Text.Encoding]::UTF8.GetBytes($versionBody)
              Write-Host ("[diag] bytes: " + ($bytes | ForEach-Object { $_.ToString('X2') } | Select-Object -First 16 -join ' ')) -ForegroundColor Yellow
            } catch { Write-Host "[diag] snippet error: $_" -ForegroundColor Yellow }
          }
          # fallback attempts
          if($len -lt 10){
            Write-Host "[diag] retry /version without compression" -ForegroundColor Yellow
            $versionBody = curl --ssl-no-revoke -sk -H "Accept: application/json" $versionUrl 2>$null
            try { $versionObj = if($versionBody){ $versionBody | ConvertFrom-Json } else { $null } } catch { $versionObj=$null }
            if(-not $versionObj){
              Write-Host "[diag] retry /version via Invoke-WebRequest" -ForegroundColor Yellow
              try { $iwr = Invoke-WebRequest -UseBasicParsing -Uri $versionUrl -Headers @{Accept='application/json'} -ErrorAction Stop; $versionBody=$iwr.Content; $versionObj = $versionBody | ConvertFrom-Json } catch { Write-Host "[diag] iwr fallback failed: $_" -ForegroundColor Yellow }
            }
          }
        }
        _ok ($null -ne $versionObj) "/version parses JSON"
        if ($versionObj) {
          $must = 'version','commit','built_at','startup_ts'
          $have = $versionObj.PSObject.Properties.Name
          $diff = @(Compare-Object -ReferenceObject $must -DifferenceObject $have)
          _ok ($diff.Count -eq 0) "/version keys complete"
        }

# 3) /help ETag flow (unless skipped)
if (-not $SkipHelp) {
  $helpPayload = '{"card_id":"overview","mode":"what","month":"2025-08","deterministic_ctx":{},"base_text":null}'
  $firstResp = curl --ssl-no-revoke -sk -D - -H "content-type: application/json" -d $helpPayload "$Base/help?__nocache=$ts"
  $statusLine = ($firstResp -split "`n")[0]
  $etagLine = ($firstResp -split "`n" | Where-Object { $_ -match '^ETag:' })
  $etag = ($etagLine -replace '^ETag:\s*','').Trim()
  _ok ($statusLine -match ' 200 ') "/help first -> $statusLine"
  if ($etag) { Write-Host "[info] ETag=$etag" -ForegroundColor DarkGray } else { Write-Host "[warn] No ETag header in first /help" -ForegroundColor Yellow }
  if ($etag) {
  $reCode = GetStatus POST "$Base/help" @('content-type: application/json',"If-None-Match: $etag") $helpPayload
    _ok ($reCode -in @('304','200')) "/help revalidate -> $reCode (expect 304/200)"
  }
}

# 4) Auth login negative
$badCreds = '{"email":"nobody@example.com","password":"bad"}'
$authCode = GetStatus POST "$Base/api/auth/login?__nocache=$ts" @('content-type: application/json') $badCreds
_ok ($authCode -in @('401','422')) "/api/auth/login -> $authCode (expect 401/422)"

# 5) Asset MIME check (robust)
$idxUrl = "$Base/?__nocache=$ts"
$idxHtml = curl --ssl-no-revoke -sk $idxUrl 2>&1
if (-not $idxHtml) { _ok $false "Index fetch empty" }
else {
  $assetRegexes = @(
    '/assets/[-A-Za-z0-9_\.]+\.mjs',
    '/assets/[-A-Za-z0-9_\.]+\.js'
  )
  $assetPath = $null
  foreach($rx in $assetRegexes){
    $candidate = ($idxHtml -split "`n" | Select-String -Pattern $rx -AllMatches | ForEach-Object Matches | ForEach-Object Value | Select-Object -First 1)
    if($candidate){ $assetPath = $candidate; break }
  }
  if (-not $assetPath) {
    _ok $false "No /assets/*.js or *.mjs found in index (patterns tried: $($assetRegexes -join ', '))"
  } else {
  # ensure we don't accidentally inject '=' twice; append cache buster correctly
  $sep = if($assetPath -match '\?'){ '&' } else { '?' }
  $assetUrl = "$Base$assetPath$sep`__v=$ts"
    $assetHead = CurlHead $assetUrl
    $ct = ($assetHead -split "`n" | Where-Object { $_ -match '^Content-Type:' }) -join ''
    if(-not $ct){ Write-Host "[diag] asset head raw: $assetHead" -ForegroundColor Yellow }
    _ok ($ct -match 'application/javascript') "Asset MIME -> $ct"
  }
}

# 6) Optional redirect tests (/auth/refresh -> /api/auth/refresh)
if (-not $SkipRedirects) {
  try {
    $refresh = Invoke-WebRequest -Uri "$Base/auth/refresh" -Method GET -MaximumRedirection 0 -ErrorAction Stop
    _ok ($refresh.StatusCode -eq 308) "/auth/refresh 308"
    if ($refresh.StatusCode -eq 308) {
      _ok ($refresh.Headers.Location -match '/api/auth/refresh$') "Location header -> $($refresh.Headers.Location)"
    }
  } catch {
    _ok $false "/auth/refresh redirect check failed: $_"
  }
}

if ($Debug) { Write-Host "[debug] Completed all sections" -ForegroundColor Magenta }

if ($script:FAIL) { Write-Host "[edge-smoke] FAIL" -ForegroundColor Red; exit 2 } else { Write-Host "[edge-smoke] All checks passed" -ForegroundColor Cyan }
