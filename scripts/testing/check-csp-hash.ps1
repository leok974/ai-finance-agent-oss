param(
  [string]$Url = "https://app.ledger-mind.org",
  [string]$ExpectedHashFile = ".csp.sha"
)

function Get-LastHeaderMap($u){
  $tmp = [System.IO.Path]::GetTempFileName()
  try {
    $raw = & curl.exe --ssl-no-revoke -sSL -D - -o $tmp $u 2>$null
    $blocks = $raw -split "(`r?`n){2,}(?=HTTP/)"
    if ($blocks.Count -gt 1) { $raw = $blocks[-1] }
    $map = @{}
    foreach ($line in ($raw -split "`r?`n")) {
      if ($line -match '^(?<n>[^:]+):\s*(?<v>.*)$') {
        $map[$matches['n'].ToLowerInvariant()] = $matches['v']
      }
    }
    return $map
  } finally { Remove-Item -Force $tmp -ErrorAction SilentlyContinue }
}

$hdrs = Get-LastHeaderMap $Url
$policy = $hdrs['content-security-policy']
if (-not $policy) { Write-Error "No CSP header at $Url"; exit 10 }

$sha = [System.Security.Cryptography.SHA256]::Create()
$hash = ($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($policy)) | ForEach-Object { $_.ToString('x2') }) -join ''

if (!(Test-Path $ExpectedHashFile)) {
  Set-Content -NoNewline -Path $ExpectedHashFile -Value $hash
  Write-Host "[csp] wrote baseline $hash"
  exit 0
}
$expected = (Get-Content -Raw $ExpectedHashFile).Trim()
if ($hash -ne $expected) {
  Write-Error "[csp] DRIFT: live=$hash expected=$expected"
  exit 11
}
Write-Host "[csp] OK: $hash"; exit 0
