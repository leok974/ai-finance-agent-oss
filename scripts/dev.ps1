# Start Ollama, backend (uvicorn), and frontend (Vite) together, streaming logs.
param(
  [string]$Model = "gpt-oss:20b",
  [string]$Py = ".venv/Scripts/python.exe"
)
$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $MyInvocation.MyCommand.Path | Split-Path -Parent

function Ensure-Pnpm {
  if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
    if (Get-Command corepack -ErrorAction SilentlyContinue) {
      corepack enable
      corepack prepare pnpm@latest --activate
    } else {
      npm i -g pnpm
    }
  }
}

# 0) Unblock local scripts (no-op if already unblocked)
Get-ChildItem "$repo/scripts/*.ps1" -ErrorAction SilentlyContinue | Unblock-File | Out-Null

# 1) Ollama + model
$ollama = Start-Job -Name Ollama -ScriptBlock {
  param($repo,$Model)
  Set-Location $repo
  & "$repo/scripts/run-ollama.ps1" -Model $Model
} -ArgumentList $repo,$Model

# 2) Backend (uvicorn)
$backend = Start-Job -Name Backend -ScriptBlock {
  param($repo,$Py)
  Set-Location "$repo/apps/backend"
  # Prefer Postgres in dev (matches docker-compose postgres service)
  $env:DATABASE_URL = "postgresql+psycopg://myuser:password@localhost:5432/finance"
  $env:APP_ENV = "dev"
  $env:PYTHONNOUSERSITE = "1"
  Write-Host "[Backend] Using DATABASE_URL=$env:DATABASE_URL"
  & $Py -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
} -ArgumentList $repo,$Py

# 3) Frontend (pnpm dev)
$frontend = Start-Job -Name Frontend -ScriptBlock {
  param($repo)
  Set-Location "$repo/apps/web"
  # ensure pnpm
  if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
    if (Get-Command corepack -ErrorAction SilentlyContinue) { corepack enable; corepack prepare pnpm@latest --activate }
    else { npm i -g pnpm }
  }
  pnpm install
  pnpm dev
} -ArgumentList $repo

Write-Host "`n=== Streaming logs (Ctrl+C to stop) ===`n"
Receive-Job -Name Ollama,Backend,Frontend -Wait
