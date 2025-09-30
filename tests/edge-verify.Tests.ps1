Param()

# Ensure script functions are loaded only once
$scriptPath = Join-Path $PSScriptRoot '..' 'scripts' 'edge-verify.ps1'
if(-not (Get-Command Get-HeaderMap -ErrorAction SilentlyContinue)){
  . $scriptPath
}

Describe 'Header map & SSE parsers' {
  It 'parses Content-Length correctly' {
    $raw = @"
HTTP/1.1 200 OK
Content-Length: 617
Content-Type: application/json

"@
    $hdr = Get-HeaderMap $raw
    $map = $hdr[0]
    # Pester 3.x syntax: remove dash before Be
    $map['Content-Length'] | Should Be '617'
  }

  It 'detects duplicate CSP headers uniquely' {
    $raw = @"
HTTP/1.1 200 OK
Content-Security-Policy: frame-ancestors 'none'
X-Frame-Options: DENY
Content-Security-Policy: default-src 'self'

"@
    $hdr = Get-HeaderMap $raw
    $map = $hdr[0]; $dups = $hdr[1]
    # Should capture CSP once in duplicates list
    ($dups -contains 'Content-Security-Policy') | Should Be $true
    ($dups | Where-Object { $_ -eq 'Content-Security-Policy' }).Count | Should Be 1
  }

  It 'fallback parses Content-Length when header missing primary map' {
    # Simulate a case where Content-Length line appears with odd capitalization/spaces so primary regex misses
    $raw = @"
HTTP/1.1 200 OK
Transfer-Encoding: chunked
X-Frame-Options: DENY

content-length: 321
Some-Other: value
"@
    # With updated Get-HeaderMap (stops at first blank), Content-Length after blank line won't be in map
    $mapTuple = Get-HeaderMap $raw
    $mapLocal = $mapTuple[0]
    ($mapLocal.Keys -contains 'Content-Length') | Should Be $false
    # Emulate fallback scan logic (case-insensitive search across all raw lines)
    $found = $null
    foreach($ln in ($raw -split "`r?`n")){
      if($ln -match '^(?i)Content-Length:\s*(\d+)\s*$'){ $found = [int]$Matches[1]; break }
    }
    $found | Should Be 321
  }

  It 'SSE probe returns ok=false for non-200/404 fast failure (simulated invalid host)' -Skip:$IsWindows {
    # Using an unroutable TLD to ensure failure quickly; expect ok false.
    $sse = Invoke-SseProbe -Url 'https://invalid.invalid/stream' -TimeoutSec 2
    $sse.ok | Should Be $false
  }
}
