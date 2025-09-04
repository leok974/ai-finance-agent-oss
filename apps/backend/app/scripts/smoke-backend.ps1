param(
  [string]$BaseUrl = "http://127.0.0.1:8000"
)

$ErrorActionPreference = "Stop"
$endpoints = @(
  "/healthz",
  "/charts/month_summary",
  "/charts/month_merchants",
  "/charts/month_flows",
  "/charts/spending_trends"
)

Write-Host "Backend smoke: $BaseUrl" -ForegroundColor Cyan
$ok = $true

foreach ($ep in $endpoints) {
  $url = "$BaseUrl$ep"
  try {
    $elapsed = (Measure-Command { $res = Invoke-RestMethod -Uri $url -TimeoutSec 10 }).TotalMilliseconds
    # Light content sanity for /healthz
    if ($ep -eq "/healthz") {
      if (-not $res.status -or $res.status -ne "ok") { throw "status != ok" }
      if ($res.models_ok -ne $true) { throw "models_ok != true" }
    }
    Write-Host ("✅ {0}  {1}ms" -f $url, [int]$elapsed) -ForegroundColor Green
  }
  catch {
    Write-Host ("❌ {0}  -> {1}" -f $url, $_.Exception.Message) -ForegroundColor Red
    $ok = $false
  }
}

if (-not $ok) {
  Write-Host "Smoke test FAILED" -ForegroundColor Red
  exit 1
} else {
  Write-Host "Smoke test PASSED" -ForegroundColor Green
  exit 0
}
