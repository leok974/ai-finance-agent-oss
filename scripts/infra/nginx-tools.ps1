param(
  [switch]$Reload,
  [switch]$Logs,
  [int]$Lines = 120
)
$ErrorActionPreference = 'Stop'
$FILES = @('-f','docker-compose.prod.yml','-f','docker-compose.prod.override.yml')
function Invoke-NginxTest {
  docker --context desktop-linux compose $FILES exec nginx nginx -t
}
function Invoke-NginxReload {
  docker --context desktop-linux compose $FILES exec nginx nginx -s reload
}
function Get-NginxLogs {
  docker --context desktop-linux compose $FILES exec nginx sh -lc "tail -n +1 /var/log/nginx/*.log | sed -n '1,${Lines}p'"
}
if ($Reload) { Invoke-NginxReload }
elseif ($Logs) { Get-NginxLogs }
else { Invoke-NginxTest }
