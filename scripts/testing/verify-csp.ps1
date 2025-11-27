<#
.SYNOPSIS
  Verify CSP header integrity and inline script hash coverage.

.DESCRIPTION
  Mirrors scripts/verify-csp.sh for Windows users.
  - Fails if placeholder __INLINE_SCRIPT_HASHES__ remains.
  - Fails if 'unsafe-inline' appears.
  - If no inline scripts -> requires zero sha256 hashes.
  - If inline scripts exist -> requires hash count >= inline script count.

.PARAMETER Url
  Target URL (default http://127.0.0.1/)

.EXAMPLE
  pwsh ./scripts/verify-csp.ps1 -Url http://127.0.0.1/
#>
param(
  [string]$Url = 'http://127.0.0.1/'
)

function Fail($msg) { Write-Error "[verify-csp][FAIL] $msg"; exit 1 }
function Info($msg) { Write-Host "[verify-csp] $msg" }

Info "Fetching headers: $Url"
try { $resp = Invoke-WebRequest -Uri $Url -Method Head -TimeoutSec 10 -ErrorAction Stop } catch { Fail "Failed to fetch headers: $_" }
$csp = $resp.Headers['Content-Security-Policy']
if (-not $csp) { Fail 'Missing Content-Security-Policy header' }
if ($csp -match '__INLINE_SCRIPT_HASHES__') { Fail 'Placeholder __INLINE_SCRIPT_HASHES__ still present' }
if ($csp -match "'unsafe-inline'") { Fail "'unsafe-inline' unexpectedly present in script-src" }

if ($csp -notmatch 'script-src') { Fail 'Could not parse script-src directive' }
$scriptSrc = [regex]::Match($csp,'script-src\s+([^;]+)')
if (-not $scriptSrc.Success) { Fail 'script-src tokens not captured' }
$tokens = $scriptSrc.Groups[1].Value -split '\s+' | Where-Object { $_ }
$hashTokens = $tokens | Where-Object { $_ -like "'sha256-*" }

Info 'Fetching document body for inline script analysis'
try { $html = Invoke-WebRequest -Uri $Url -Method Get -TimeoutSec 15 -ErrorAction Stop } catch { Fail "Failed to fetch HTML: $_" }
# Count inline <script> tags without src (simple heuristic)
$inlineCount = ([regex]::Matches($html.Content,'<script(?![^>]*\bsrc=)[^>]*>','IgnoreCase')).Count
$hashCount = $hashTokens.Count
Info "Inline scripts: $inlineCount | Hash tokens: $hashCount"

if ($inlineCount -eq 0) {
  if ($hashCount -ne 0) { Fail "Expected zero hashes (no inline scripts), found $hashCount" }
} else {
  if ($hashCount -lt $inlineCount) { Fail "Insufficient hashes: have $hashCount need >= $inlineCount" }
}

Info "PASS: CSP header valid for $Url"
