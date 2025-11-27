Param()
Write-Host "[check-ui] Listing JS asset files from running web container (proxied by edge nginx)" -ForegroundColor Cyan
$composeFiles = @('-f','docker-compose.prod.yml')
if (Test-Path 'docker-compose.prod.override.yml') { $composeFiles += @('-f','docker-compose.prod.override.yml') }
# Ensure container is up
$null = docker compose @composeFiles ps
try {
  docker compose @composeFiles exec web sh -c 'ls -1 /usr/share/nginx/html/assets | grep -E "\.js$" | tail -n 20'
} catch {
  Write-Host "web container not running or assets directory missing" -ForegroundColor Yellow
  exit 1
}
