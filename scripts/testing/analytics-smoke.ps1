param(
  [string]$BaseUrl = "http://127.0.0.1"
)

Write-Host "== Analytics smoke against $BaseUrl" -ForegroundColor Cyan

# Prepare payload (compact JSON)
$payload = @{ event = "smoke"; props = @{ email = "alice@example.com"; note = "ok" } } | ConvertTo-Json -Compress

# POST event
$code = curl -s -o $null -w "%{http_code}" -X POST "$BaseUrl/agent/analytics/event" -H "content-type: application/json" --data $payload
if ($code -ne "204") {
  Write-Error "POST /agent/analytics/event => $code"
  exit 1
}

# Fetch metrics
$metrics = curl -s "$BaseUrl/metrics"
if ($LASTEXITCODE -ne 0 -or -not $metrics) {
  Write-Error "Failed to fetch /metrics"
  exit 1
}

$eventLine = ($metrics | Select-String 'analytics_events_total{event="smoke"}')
$scrubLine = ($metrics | Select-String '^analytics_scrubbed_fields_total')

if (-not $eventLine) { Write-Error "No analytics_events_total for 'smoke'"; exit 1 }
if (-not $scrubLine) { Write-Error "No analytics_scrubbed_fields_total increment"; exit 1 }

Write-Host "OK: event + scrub counters present" -ForegroundColor Green
exit 0
