Param(
    [string]$ComposeFiles = "-f docker-compose.prod.yml -f docker-compose.prod.override.yml",
    [switch]$Explain,
    [switch]$Vacuum
)

Write-Host "[verify] Checking Alembic heads (graph only)" -ForegroundColor Cyan
$env:ALEMBIC_INI = "apps/backend/alembic.ini"
python scripts/alembic_guard.py || exit 1

Write-Host "[verify] Index presence" -ForegroundColor Cyan
docker compose $ComposeFiles exec -T postgres psql -U myuser -d finance -c "SELECT indexname FROM pg_indexes WHERE tablename='transactions' AND indexname='ix_transactions_date_desc';" || exit 1

if ($Vacuum) {
  Write-Host "[verify] VACUUM ANALYZE transactions" -ForegroundColor Yellow
  docker compose $ComposeFiles exec -T postgres psql -U myuser -d finance -c "VACUUM ANALYZE transactions;" | Out-Null
}

if ($Explain) {
  Write-Host "[verify] EXPLAIN latest month aggregate" -ForegroundColor Cyan
  docker compose $ComposeFiles exec -T postgres psql -U myuser -d finance -c "EXPLAIN (ANALYZE,BUFFERS) SELECT to_char(MAX(date),'YYYY-MM') FROM transactions;" || exit 1
}

Write-Host "[verify] Endpoint sanity (POST)" -ForegroundColor Cyan
try {
  $resp = curl -s -X POST http://localhost:8000/agent/tools/meta/latest_month -H 'content-type: application/json' -d '{}' -w ' HTTP%{http_code}'
  Write-Host $resp
} catch { Write-Warning "Curl POST failed: $_" }

Write-Host "[verify] Endpoint sanity (GET compat)" -ForegroundColor Cyan
try {
  $resp = curl -s http://localhost:8000/agent/tools/meta/latest_month -w ' HTTP%{http_code}'
  Write-Host $resp
} catch { Write-Warning "Curl GET failed: $_" }

Write-Host "[verify] Metric sample" -ForegroundColor Cyan
try {
  curl -s http://localhost:8000/metrics | Select-String meta_latest_month_null_total | Select-Object -First 1 | ForEach-Object { $_.Line }
} catch { Write-Warning "Metrics fetch failed: $_" }

Write-Host "[verify] Done" -ForegroundColor Green
