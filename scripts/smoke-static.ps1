[CmdletBinding()]
param(
    [string]$BaseUrl = 'http://localhost'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Fail {
    param([string]$Message)
    Write-Host "[fail] $Message" -ForegroundColor Red
    exit 1
}

$normalizedBase = $BaseUrl.TrimEnd('/')
if (-not $normalizedBase) {
    Fail 'BaseUrl cannot be empty.'
}

$curlCmd = if ($IsWindows) { 'curl.exe' } else { 'curl' }
if (-not (Get-Command $curlCmd -ErrorAction SilentlyContinue)) {
    Fail 'curl is required but was not found on PATH.'
}

function Get-CurlArgs {
    param(
        [string]$Url,
        [string[]]$Extra = @()
    )

    $args = @()
    if ($IsWindows) { $args += '--ssl-no-revoke' }
    $args += '--fail'
    $args += '--max-time'; $args += '15'
    $args += $Extra
    $args += $Url
    return $args
}

function Invoke-CurlRaw {
    param(
        [string]$Url,
        [string[]]$Extra = @()
    )

    $args = Get-CurlArgs -Url $Url -Extra $Extra
    $output = & $curlCmd @args 2>&1
    if ($LASTEXITCODE -ne 0) {
        Fail "curl $($Extra -join ' ') $Url failed:`n$output"
    }
    return ($output -join "`n")
}

function Invoke-CurlGet {
    param([string]$Url)
    Invoke-CurlRaw -Url $Url -Extra @('-s')
}

function Invoke-CurlHead {
    param([string]$Url)
    Invoke-CurlRaw -Url $Url -Extra @('-sI')
}

function Get-HeaderValue {
    param(
        [string]$Headers,
        [string]$Name
    )

    foreach ($line in ($Headers -split "`n")) {
        $trimmed = $line.Trim()
        if (-not $trimmed) { break }
        if ($trimmed -match "^(?i)$Name\s*:\s*(.+)$") {
            return $Matches[1].Trim()
        }
    }
    return $null
}

function Assert-StatusOk {
    param(
        [string]$Headers,
        [string]$Url
    )

    $statusLine = ($Headers -split "`n")[0]
    if (-not $statusLine) {
        Fail "No status line returned for $Url"
    }
    if ($statusLine -notmatch 'HTTP/\S+\s+(200|304)') {
        Fail "Unexpected status for ${Url}: $statusLine"
    }
}

function Assert-ContentType {
    param(
        [string]$Url,
        [string]$Headers,
        [string]$ExpectedPrefix
    )

    Assert-StatusOk -Headers $Headers -Url $Url
    $ct = Get-HeaderValue -Headers $Headers -Name 'Content-Type'
    if (-not $ct) {
        Fail "No Content-Type in response for $Url"
    }
    if ($ct -notlike "$ExpectedPrefix*") {
        Fail "Unexpected Content-Type for ${Url}: $ct (expected prefix $ExpectedPrefix)"
    }
    Write-Host "[ok] $Url => $ct" -ForegroundColor Green
}

Write-Host "[static-smoke] BaseUrl=$normalizedBase" -ForegroundColor Cyan

$indexUrl = "$normalizedBase/index.html?x=$(Get-Random)"
$indexHtml = Invoke-CurlGet -Url $indexUrl
if (-not $indexHtml.Trim()) {
    Fail 'index.html empty'
}

$jsPath = [regex]::Match($indexHtml, '/assets/[\w\.-]+\.js').Value
$cssPath = [regex]::Match($indexHtml, '/assets/[\w\.-]+\.css').Value

if (-not $jsPath) { Fail 'No JS asset reference found in index.html' }
if (-not $cssPath) { Fail 'No CSS asset reference found in index.html' }

Write-Host "[static-smoke] JS asset:  $jsPath" -ForegroundColor Yellow
Write-Host "[static-smoke] CSS asset: $cssPath" -ForegroundColor Yellow

$jsUrl = "{0}{1}?x={2}" -f $normalizedBase, $jsPath, (Get-Random)
$cssUrl = "{0}{1}?x={2}" -f $normalizedBase, $cssPath, (Get-Random)

$jsHeaders = Invoke-CurlHead -Url $jsUrl
Assert-ContentType -Url $jsUrl -Headers $jsHeaders -ExpectedPrefix 'application/javascript'

$cssHeaders = Invoke-CurlHead -Url $cssUrl
Assert-ContentType -Url $cssUrl -Headers $cssHeaders -ExpectedPrefix 'text/css'

$manifestUrl = "{0}/site.webmanifest?x={1}" -f $normalizedBase, (Get-Random)
$manifestHeaders = Invoke-CurlHead -Url $manifestUrl
Assert-ContentType -Url $manifestUrl -Headers $manifestHeaders -ExpectedPrefix 'application/manifest+json'

Write-Host '[static-smoke] All static MIME checks passed' -ForegroundColor Cyan
