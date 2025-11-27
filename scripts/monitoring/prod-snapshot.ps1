$ErrorActionPreference = 'Stop'
$base = "http://127.0.0.1"
# Query nginx-exposed ready endpoint (maps to backend /ready)
$health = (Invoke-WebRequest -UseBasicParsing -Uri ("{0}/api/healthz" -f $base) | Select-Object -ExpandProperty Content | ConvertFrom-Json)
$mode = $health.crypto_mode
$isReady = $health.crypto_ready
$label = $health.crypto_label
$ng = (docker compose -f "$PSScriptRoot/../docker-compose.prod.yml" ps nginx | Out-String).Trim()
$cf = (docker compose -f "$PSScriptRoot/../docker-compose.prod.yml" ps cloudflared | Out-String).Trim()
$status = [ordered]@{
  ok = $health.ok
  crypto_mode = $mode
  crypto_ready = $isReady
  crypto_label = $label
  nginx = $ng
  cloudflared = $cf
}
$status | ConvertTo-Json -Depth 5
