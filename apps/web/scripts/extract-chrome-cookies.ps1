# Simple Chrome cookie extractor for Playwright
param([string]$OutputPath = ".\tests\e2e\.auth\prod-state.json")

if (-not (Get-Module -ListAvailable -Name PSSQLite)) {
    Install-Module -Name PSSQLite -Scope CurrentUser -Force
}
Import-Module PSSQLite

$cookiesDb = "$env:LOCALAPPDATA\Google\Chrome\User Data\Default\Network\Cookies"
$tempDb = "$env:TEMP\chrome_cookies_temp.db"
Copy-Item -Path $cookiesDb -Destination $tempDb -Force

$query = "SELECT name, value, host_key, path, expires_utc, is_secure, is_httponly, samesite FROM cookies WHERE host_key LIKE '%ledger-mind.org%'"
$cookies = Invoke-SqliteQuery -DataSource $tempDb -Query $query

if ($cookies.Count -eq 0) {
    Write-Host "No cookies found for ledger-mind.org"
    Remove-Item $tempDb
    exit 1
}

$pwCookies = @()
foreach ($c in $cookies) {
    $expires = ($c.expires_utc / 1000000.0) - 11644473600
    $sameSite = @("None", "Lax", "Strict")[$c.samesite]
    $pwCookies += @{
        name = $c.name
        value = $c.value
        domain = $c.host_key
        path = $c.path
        expires = $expires
        httpOnly = [bool]$c.is_httponly
        secure = [bool]$c.is_secure
        sameSite = $sameSite
    }
}

$state = @{ cookies = $pwCookies; origins = @() }
$dir = Split-Path -Parent $OutputPath
if (-not (Test-Path $dir)) { New-Item -Type Directory $dir -Force | Out-Null }
Set-Content -Path $OutputPath -Value ($state | ConvertTo-Json -Depth 10) -Encoding UTF8
Remove-Item $tempDb -ErrorAction SilentlyContinue

Write-Host "Extracted $($cookies.Count) cookies to $OutputPath"
