# Start production-style stack (nginx runtime for web)
param()
Write-Host "[prod.ps1] Starting production stack..."
docker compose -f docker-compose.yml -f docker-compose.prod.override.yml up -d
