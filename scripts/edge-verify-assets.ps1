[CmdletBinding()]param(
  [string]$BaseUrl = 'https://app.ledger-mind.org',
  [switch]$Json
)
$ErrorActionPreference='Stop'
function W($m){ if(-not $Json){ Write-Host "[assets] $m" } }

$curl = ($IsWindows -or ($PSStyle.Platform -eq 'Windows')) ? 'curl.exe' : 'curl'
$extra = @('--ssl-no-revoke')

try {
  $index = & $curl @extra -s $BaseUrl/
  $headIndex = & $curl @extra -s -I $BaseUrl/
  $cspLine = ($headIndex -split "`n") | Where-Object { $_ -match '(?i)^Content-Security-Policy:' }
  # Regex patterns: use double quotes for the string so we can escape easily
  $cssPath = ($index | Select-String -Pattern "/assets/[^`"']+\.css" -AllMatches | ForEach-Object { $_.Matches.Value } | Select-Object -First 1)
  $jsPath  = ($index | Select-String -Pattern "/assets/[^`"']+\.js"  -AllMatches | ForEach-Object { $_.Matches.Value } | Select-Object -First 1)
  $cssHead = $null; $jsHead = $null
  if($cssPath){ $cssHead = & $curl @extra -s -I ("$BaseUrl$cssPath") }
  if($jsPath){  $jsHead  = & $curl @extra -s -I ("$BaseUrl$jsPath") }
  $cssOk = $false; $jsOk = $false
  if($cssHead){ $cssOk = (($cssHead -join "\n") -match 'Content-Type:\s*text/css') }
  if($jsHead){ $jsOk = (($jsHead -join "\n") -match 'Content-Type:\s*application/(javascript|x-javascript)') }
  $obj = [pscustomobject]@{
    csp_present = [bool]$cspLine
    css_path = $cssPath
    js_path = $jsPath
    css_mime_ok = $cssOk
    js_mime_ok = $jsOk
  }
  if($Json){ $obj | ConvertTo-Json -Depth 4 } else { $obj }
} catch {
  if($Json){
    [pscustomobject]@{ error=$_.Exception.Message } | ConvertTo-Json
  } else {
    Write-Host ("Error: {0}" -f $_.Exception.Message) -ForegroundColor Red
  }
  exit 1
}
