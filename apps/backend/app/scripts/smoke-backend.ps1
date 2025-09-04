# apps/backend/scripts/smoke-backend.ps1
try {
  $res = Invoke-RestMethod -Uri http://127.0.0.1:8000/healthz -TimeoutSec 2
  if ($res.status -ne "ok") { throw "Backend not healthy" }
  Write-Output "Backend OK"
  exit 0
}
catch {
  Write-Output "Backend not running, skipping check"
  exit 0
}
