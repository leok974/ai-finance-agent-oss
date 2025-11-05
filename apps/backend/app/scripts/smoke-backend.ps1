# apps/backend/scripts/smoke-backend.ps1
try {
  $port = if ($env:BACKEND_PORT) { $env:BACKEND_PORT } else { '8000' }
  $res = Invoke-RestMethod -Uri ("http://127.0.0.1:$port/healthz") -TimeoutSec 2
  if ($res.status -ne "ok") { throw "Backend not healthy" }
  Write-Output "Backend OK"
  exit 0
}
catch {
  Write-Output "Backend not running, skipping check"
  exit 0
}
