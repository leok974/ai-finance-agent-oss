# Start development stack with live Vite (Node+pnpm) and backend
param()
Write-Host "[dev-stack.ps1] Starting dev stack (web+backend+postgres)..."
docker compose -f docker-compose.dev.yml up -d web backend postgres
