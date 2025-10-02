$ErrorActionPreference = 'Stop'

# Identify nginx container name
$NG = (& docker ps --format "{{.Names}}" | Select-String "nginx" | ForEach-Object { $_.ToString() } | Select-Object -First 1)
if (-not $NG) { Write-Error "Could not find nginx container" }

Write-Host "[SSE] Checking AG-UI headers via internal endpoint..."
docker exec $NG sh -lc "apk add --no-cache curl >/dev/null 2>&1 || true; curl -sI http://agui:3030/agui/chat | head -n 10"

Write-Host "[SSE] Reading a few SSE lines through Nginx (external)..."
# Note: Update the host below for your environment if needed
curl.exe -sN -H "Accept: text/event-stream" https://app.ledger-mind.org/agui/chat --max-time 5 | Select-Object -First 5

Write-Host "[SSE] Done. Expect 'Content-Type: text/event-stream' in headers and a couple of 'event:'/'data:' lines above."