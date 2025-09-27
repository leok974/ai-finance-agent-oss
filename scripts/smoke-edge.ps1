param(
  [string]$Base = "https://app.ledger-mind.org",
  [switch]$Debug
)
$ErrorActionPreference = 'Stop'

function Assert($cond, $msg) {
  if (-not $cond) { throw "ASSERT FAIL: $msg" }
}

Write-Host "[smoke-edge] Base=$Base" -ForegroundColor Cyan

# 1) Redirect /auth/refresh -> /api/auth/refresh (308)
$refresh = Invoke-WebRequest -Uri "$Base/auth/refresh" -Method GET -MaximumRedirection 0 -ErrorAction SilentlyContinue
Assert ($refresh.StatusCode -eq 308) "/auth/refresh expected 308, got $($refresh.StatusCode)"
$loc = $refresh.Headers.Location
Assert ($loc -match "/api/auth/refresh$") "Location header not /api/auth/refresh: $loc"
Write-Host "[ok] /auth/refresh 308 redirect -> $loc"

# 2) Version endpoint
$versionJson = Invoke-WebRequest -Uri "$Base/_version" -UseBasicParsing | Select-Object -ExpandProperty Content | ConvertFrom-Json
Assert ($versionJson.commit -and $versionJson.commit -ne 'unknown') "commit missing/unknown"
Assert ($versionJson.built_at -and $versionJson.built_at -ne 'unknown') "built_at missing/unknown"
Write-Host "[ok] /_version commit=$($versionJson.commit) built_at=$($versionJson.built_at)"

# 3) (Optional) Debug forwarded proto check
if ($Debug) {
  try {
    $dbg = Invoke-WebRequest -Uri "$Base/api/auth/debug" -UseBasicParsing -ErrorAction Stop
    $body = $dbg.Content | ConvertFrom-Json
    if ($body.xf_proto) { Write-Host "[ok] xf_proto=$($body.xf_proto)" } else { Write-Host "[warn] xf_proto absent" }
  } catch { Write-Host "[skip] auth debug not available: $_" }
}

Write-Host "[smoke-edge] All checks passed." -ForegroundColor Green
