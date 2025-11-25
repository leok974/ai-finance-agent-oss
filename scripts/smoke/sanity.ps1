$ErrorActionPreference = 'Stop'
$FILES = @('-f','docker-compose.prod.yml','-f','docker-compose.prod.override.yml')
$BASE  = 'https://app.ledger-mind.org'

docker compose @FILES up -d postgres backend nginx cloudflared | Out-Null

# Health (ignore output)
Invoke-WebRequest "$BASE/ready" -UseBasicParsing  | Out-Null
Invoke-WebRequest "$BASE/agent/models" -UseBasicParsing | Out-Null

# Seed a lot of demo data (stderr+stdout suppressed inside the container)
1..150 | ForEach-Object {
  docker compose @FILES exec -T backend sh -lc "python -m app.cli txn-demo >/dev/null 2>&1"
}

# Show one sample row so you know it worked
docker compose @FILES exec backend sh -lc "python -m app.cli txn-show-latest"

# Register/login for a cookie
$reg   = @{ email="leoklemet.pa@gmail.com"; password="Superleo3"; name="Leo" } | ConvertTo-Json
try { Invoke-WebRequest "$BASE/auth/register" -Method POST -ContentType "application/json" -Body $reg -SessionVariable sess -SkipCertificateCheck | Out-Null } catch {}
$login = @{ email="leoklemet.pa@gmail.com"; password="Superleo3" } | ConvertTo-Json
$null  = Invoke-WebRequest "$BASE/auth/login" -Method POST -ContentType "application/json" -Body $login -SessionVariable sess -SkipCertificateCheck

function Invoke-Agent([string]$text,[string]$model="gpt-oss:20b"){
  $payload = @{ messages=@(@{ role="user"; content=$text }); model=$model } | ConvertTo-Json -Depth 6
  Invoke-RestMethod -Uri "$BASE/agent/chat" -Method POST -ContentType "application/json" -Body $payload -SkipCertificateCheck
}
function Invoke-NL([string]$query="", $filters=$null){
  $body = @{ query = $query }
  if ($filters) { $body.filters = $filters }
  $json = $body | ConvertTo-Json -Depth 8
  Invoke-RestMethod -Uri "$BASE/transactions/nl" -Method POST -ContentType "application/json" -Body $json -WebSession $sess -SkipCertificateCheck
}

# NL checks
$nl1 = Invoke-NL "Starbucks this month"
$nl2 = Invoke-NL
"NL1: total=$($nl1.meta.total) intent=$($nl1.meta.intent) query='$($nl1.meta.query)'"
"NL2: reply='$($nl2.reply)' suggestions=$($nl2.meta.suggestions.Count)"

# Deterministic tools (current month)
$ym = (Get-Date).ToString('yyyy-MM')
$kpis = Invoke-Agent "KPIs for $ym"
$anom = Invoke-Agent "Any anomalies in $ym?"
$fcst = Invoke-Agent "Forecast next month"
$recur= Invoke-Agent "Show my recurring subscriptions"
$budg = Invoke-Agent "Suggest a monthly budget"

"KPIs:  mode=$($kpis.mode)  ctx=$($kpis.used_context.month)  reply='$($kpis.reply)'"
"Anom:  mode=$($anom.mode)  ctx=$($anom.used_context.month)  reply='$($anom.reply)'"
"Fcst:  mode=$($fcst.mode)  ctx=$($fcst.used_context.month)  reply='$($fcst.reply)'"
"Recur: mode=$($recur.mode) ctx=$($recur.used_context.month) reply='$($recur.reply)'"
"Budget: mode=$($budg.mode) ctx=$($budg.used_context.month) reply='$($budg.reply)'"
