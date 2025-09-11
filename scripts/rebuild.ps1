# Stop & remove any old containers/volumes
docker compose down -v

# Rebuild & start containers in background
docker compose up --build -d

# Give services ~10s to start up
Start-Sleep -Seconds 10

# Get backend container name
$BE = (docker ps --format "{{.Names}}" | Select-String -Pattern "backend" | ForEach-Object { $_.ToString() })

if (-not $BE) {
  Write-Error "Backend container not found. Check docker ps output."
  exit 1
}

Write-Host "Running migrations in $BE ..."
docker exec -it $BE alembic upgrade head

# Seed sample CSV
$CSV = "C:\ai-finance-agent-oss\apps\backend\app\data\samples\transactions_sample.csv"
if (Test-Path $CSV) {
  Write-Host "Seeding sample CSV..."
  curl.exe -X POST `
    -F "file=@$CSV" `
    "http://127.0.0.1:8000/ingest?replace=true"
} else {
  Write-Warning "Sample CSV not found at $CSV. Skipping ingest."
}

Write-Host "`n✅ Rebuild complete. Visit http://localhost:5173/app/"
