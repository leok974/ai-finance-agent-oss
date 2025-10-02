param(
  [string]$Base = "https://app.ledger-mind.org"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function _badge($ok,$msg){ if($ok){Write-Host "✅ $msg" -ForegroundColor Green}else{Write-Host "❌ $msg" -ForegroundColor Red} }

$ts = [int][double]::Parse((Get-Date -UFormat %s))

# 1) /_up should be 204
$code = (curl -sk -o NUL -w "%{http_code}" "$Base/_up?__nocache=$ts")
_badge ($code -eq "204") "/_up -> $code (expect 204)"

# 2) Get index, extract a hashed JS under /assets
$idx = curl -sk "$Base/?__nocache=$ts"
$asset = ($idx -split "`n" | Select-String -Pattern "/assets/[-A-Za-z0-9_\.]+\.js" -AllMatches | ForEach-Object Matches | ForEach-Object Value | Select-Object -First 1)
if(-not $asset){ _badge $false "Could not find an /assets/*.js in index.html"; exit 1 }

# 3) HEAD the asset with cache buster; check MIME + CF headers
$h = curl -skI "$Base$asset?__nocache=$ts"
$ct = ($h -split "`n" | Where-Object {$_ -match "^Content-Type:"}) -join ""
$cf = ($h -split "`n" | Where-Object {$_ -match "^CF-Cache-Status:"}) -join ""
_badge ($ct -match "application/javascript") "Asset MIME ($asset) -> $ct"
if($cf){ Write-Host "ℹ️ CF: $cf" }

# 4) /api/auth/login should be 401/422 (never 404/530)
$body = '{"email":"nobody@example.com","password":"bad"}'
$auth = (curl -sk -o NUL -w "%{http_code}" -H "content-type: application/json" -d $body "$Base/api/auth/login?__nocache=$ts")
_badge ($auth -in @("401","422")) "/api/auth/login -> $auth (expect 401/422)"

# 5) /help should 200 then 304 with If-None-Match
$data = '{"card_id":"overview","mode":"what","month":"2025-08","deterministic_ctx":{},"base_text":null}'
$first = curl -sk -D - -H "content-type: application/json" -d $data "$Base/help?__nocache=$ts"
$etag = ($first -split "`n" | Where-Object {$_ -match "^ETag:"} | ForEach-Object {$_ -replace "^ETag:\s*",""}).Trim()
$st1  = ($first -split "`n")[0]
_badge ($st1 -match " 200 ") "/help first -> $st1"
$st2 = (curl -sk -o NUL -w "%{http_code}" -H "content-type: application/json" -H "If-None-Match: $etag" -d $data "$Base/help")
_badge ($st2 -in @("304","200")) "/help second (If-None-Match) -> $st2"

# 6) Summary exit code (non-zero if core expectations failed)
if($ct -notmatch "application/javascript" -or $auth -notin @("401","422") -or $st2 -notin @("304","200")) { exit 2 }

exit 0
