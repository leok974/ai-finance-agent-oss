[CmdletBinding()]
param(
    [string]$Base = "https://app.ledger-mind.org",
    [string]$AssetPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$curlCmd = if ($IsWindows) { 'curl.exe' } else { 'curl' }

function Get-CurlArgs {
    param(
        [string]$Url,
        [string[]]$Extra
    )

    $args = @()
    if ($IsWindows) { $args += '--ssl-no-revoke' }
    $args += $Extra
    $args += $Url
    return $args
}

function Invoke-CurlHead {
    param([string]$Url)

    $args = Get-CurlArgs -Url $Url -Extra @('-s', '-I')
    $output = & $curlCmd @args 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "curl HEAD failed for $Url`n$output"
    }

    return ($output -join "`n")
}

function Invoke-CurlGet {
    param([string]$Url)

    $args = Get-CurlArgs -Url $Url -Extra @('-s')
    $output = & $curlCmd @args 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "curl GET failed for $Url`n$output"
    }

    return ($output -join "`n")
}

function Assert-Header {
    param(
        [string]$Headers,
        [string]$Pattern,
        [string]$ErrorMessage
    )

    if ($Headers -notmatch $Pattern) {
        throw $ErrorMessage
    }
}

$cacheBuster = Get-Random

if ([string]::IsNullOrWhiteSpace($AssetPath)) {
    $indexFetchUrl = "$Base/?x=$cacheBuster"
    Write-Host "Fetching index to discover asset: $indexFetchUrl" -ForegroundColor Cyan
    $indexBody = Invoke-CurlGet -Url $indexFetchUrl

    $assetMatch = [regex]::Match($indexBody, '/assets/[\w\.-]+\.js')
    if (-not $assetMatch.Success) {
        throw "Unable to locate a hashed JS asset in index HTML."
    }

    $AssetPath = $assetMatch.Value
    Write-Host "Discovered asset path: $AssetPath" -ForegroundColor Green
} else {
    if ($AssetPath -notmatch '^/') {
        $AssetPath = "/$AssetPath"
    }
}

$assetUrl = "{0}{1}?x={2}" -f $Base, $AssetPath, (Get-Random)
Write-Host "Checking asset HEAD: $assetUrl" -ForegroundColor Cyan
$assetHeaders = Invoke-CurlHead -Url $assetUrl
Write-Host $assetHeaders

Assert-Header -Headers $assetHeaders -Pattern "Content-Type:\s*application/javascript" -ErrorMessage "Asset Content-Type mismatch."
Assert-Header -Headers $assetHeaders -Pattern "HTTP/\S+\s+(200|304)" -ErrorMessage "Asset status not 200/304."

$indexHeadUrl = "$Base/?x=$(Get-Random)"
Write-Host "`nChecking index HEAD: $indexHeadUrl" -ForegroundColor Cyan
$indexHeaders = Invoke-CurlHead -Url $indexHeadUrl
Write-Host $indexHeaders

Assert-Header -Headers $indexHeaders -Pattern "HTTP/\S+\s+(200|304)" -ErrorMessage "Index status not 200/304."

if ($indexHeaders -match "Cache-Control:\s*(?<value>.+)") {
    $cc = $Matches['value'].Trim()
    if ($cc -notmatch "no-cache|no-store|max-age=0") {
        Write-Warning "Index Cache-Control is '$cc' (expected no-cache/no-store)."
    } else {
        Write-Host "Index Cache-Control looks good: $cc" -ForegroundColor Green
    }
} else {
    Write-Warning "Index response missing Cache-Control header."
}

Write-Host "`nAll checks completed." -ForegroundColor Green
