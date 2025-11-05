<#
  Poll a public URL with simple retries and print concise status lines.

  Examples:
    pwsh -File scripts/check-public.ps1                          # defaults to https://app.ledger-mind.org/
    pwsh -File scripts/check-public.ps1 -Url https://example.com -Retries 10 -DelaySeconds 3
#>
[CmdletBinding()]
param(
  [string]$Url = 'https://app.ledger-mind.org/',
  [int]$Retries = 6,
  [int]$DelaySeconds = 5,
  [int]$TimeoutSeconds = 15
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Continue'

function Get-Status($u) {
  try {
    $resp = Invoke-WebRequest -Uri $u -UseBasicParsing -TimeoutSec $TimeoutSeconds -MaximumRedirection 3 -ErrorAction Stop
    return @{ code = [int]$resp.StatusCode; ok = $true; error = $null }
  } catch {
    $status = $null
    try { $status = $_.Exception.Response.StatusCode.Value__ } catch {}
    return @{ code = $status; ok = $false; error = $_.Exception.Message }
  }
}

for ($i = 1; $i -le $Retries; $i++) {
  $res = Get-Status $Url
  $ts = (Get-Date).ToString('HH:mm:ss')
  if ($res.ok) {
    Write-Host ("[$ts] ${Url} → {0}" -f $res.code) -ForegroundColor Green
    exit 0
  } else {
    $codeText = if ($res.code) { $res.code.ToString() } else { 'n/a' }
    Write-Host ("[$ts] ${Url} → fail ({0}) {1}" -f $codeText, $res.error) -ForegroundColor Yellow
    if ($i -lt $Retries) { Start-Sleep -Seconds $DelaySeconds }
  }
}

exit 1
