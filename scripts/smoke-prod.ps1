param(
  [string]$BaseUrl = "https://app.ledger-mind.org",
  [string]$Email = "leoklemet.pa@gmail.com",
  [switch]$SkipAuth
)

$ErrorActionPreference = "Stop"
function Ping($path) {
  try {
    $r = Invoke-WebRequest -Uri ($BaseUrl + $path) -Method Head -TimeoutSec 10 -ErrorAction Stop
    "{0,-30} {1} {2}" -f $path, $r.StatusCode, $r.StatusDescription
  } catch {
    "{0,-30} ERROR {1}" -f $path, $_.Exception.Message
  }
}

Write-Host "== Smoke: public endpoints ==" -ForegroundColor Cyan
Ping "/api/healthz"
Ping "/api/llm/health"
try {
  $ver = Invoke-RestMethod -Uri ($BaseUrl + "/api/version") -TimeoutSec 10
  Write-Host "/api/version                   200 OK" -ForegroundColor Green
  $ver | ConvertTo-Json -Depth 6
} catch {
  Write-Host "/api/version                   ERROR $($_.Exception.Message)" -ForegroundColor Red
}

if (-not $SkipAuth) {
  $SecurePass = Read-Host "Password for $Email (ENTER to skip auth tests)" -AsSecureString
  $PlainPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecurePass)
  $Plain = [Runtime.InteropServices.Marshal]::PtrToStringAuto($PlainPtr)
  if ($Plain) {
    Write-Host "== Smoke: auth roundtrip ==" -ForegroundColor Cyan
    try {
      $resp = Invoke-WebRequest -Uri ($BaseUrl + "/api/auth/login") -Method Post `
        -ContentType "application/json" `
        -Body (@{ email = $Email; password = $Plain } | ConvertTo-Json) `
        -TimeoutSec 15 -SessionVariable S -ErrorAction Stop
      $ck = ($S.Cookies.GetCookies($BaseUrl) | ForEach-Object { "$($_.Name)=$($_.Value)" }) -join "; "
      if (-not $ck) { throw "No cookies returned from login." }
      Write-Host "Login OK; cookies present." -ForegroundColor Green

      $me = Invoke-RestMethod -Uri ($BaseUrl + "/api/auth/me") -Headers @{ "Cookie" = $ck } -TimeoutSec 10
      Write-Host "/api/auth/me                  200 OK" -ForegroundColor Green
      $me | ConvertTo-Json -Depth 6

      $chart = Invoke-RestMethod -Uri ($BaseUrl + "/api/charts/month_summary") -Headers @{ "Cookie" = $ck } -TimeoutSec 10
      Write-Host "/api/charts/month_summary     200 OK" -ForegroundColor Green
      $chart | ConvertTo-Json -Depth 6
    } catch {
      Write-Host "Auth smoke failed: $($_.Exception.Message)" -ForegroundColor Red
    }
  } else {
    Write-Host "Skipping auth tests." -ForegroundColor Yellow
  }
}

Write-Host "== /api/status summary ==" -ForegroundColor Cyan
try {
  $st = Invoke-RestMethod -Uri ($BaseUrl + "/api/status") -TimeoutSec 10
  Write-Host "/api/status              200 OK" -ForegroundColor Green
  "{0} | ok={1} t={2}ms | db={3} mig={4} crypto={5} llm={6}" -f `
    (Get-Date -Format s), $st.ok, $st.t_ms, $st.db.ok, $st.migrations.ok, $st.crypto.ok, $st.llm.ok
  if (-not $st.db.ok)         { Write-Warning "DB: $($st.db.error)" }
  if (-not $st.migrations.ok) { Write-Warning ("Migrations: current={0} head={1}" -f $st.migrations.current, $st.migrations.head) }
  if (-not $st.crypto.ok)     { Write-Warning "Crypto: $($st.crypto.error) (mode=$($st.crypto.mode))" }
  if (-not $st.llm.ok)        { Write-Warning "LLM: $($st.llm.error)" }
} catch {
  Write-Host "/api/status              ERROR $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "== Done ==" -ForegroundColor Cyan
