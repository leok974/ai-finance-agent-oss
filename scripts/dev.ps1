# Start Ollama, backend (uvicorn), and frontend (Vite) together, streaming logs.
param(
  [string]$Model = "gpt-oss:20b",
  [string]$Py = ".venv/Scripts/python.exe",
  [switch]$NoOllama,
  [switch]$Bootstrap  # Force reinstall backend dependencies
)
$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $MyInvocation.MyCommand.Path | Split-Path -Parent

function Use-Pnpm {
  if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
    if (Get-Command corepack -ErrorAction SilentlyContinue) {
      corepack enable
      corepack prepare pnpm@latest --activate
    } else {
      npm i -g pnpm
    }
  }
}

function Use-BackendVenv {
  param(
    [string]$BackendPath,
    [string]$PythonRelPath,
    [switch]$Force
  )

  Push-Location $BackendPath
  try {
    $isRelativePath = -not [System.IO.Path]::IsPathRooted($PythonRelPath)
    $pyExe = if ($isRelativePath) { Join-Path $BackendPath $PythonRelPath } else { $PythonRelPath }

    if (-not (Test-Path $pyExe)) {
      if (-not $isRelativePath) {
        throw "Python executable not found: $pyExe"
      }

      Write-Host "[Dev] Creating virtual environment (.venv)" -ForegroundColor Cyan
      $pythonInvoker = Get-Command python -ErrorAction SilentlyContinue
      $pythonArgs = @('-m', 'venv', '.venv')
      if (-not $pythonInvoker) {
        $pythonInvoker = Get-Command py -ErrorAction SilentlyContinue
        if ($pythonInvoker) {
          $pythonArgs = @('-3') + $pythonArgs
        } else {
          throw "Python executable not found. Install Python or specify -Py."
        }
      }

      & $pythonInvoker.Path @pythonArgs
      $pyExe = Join-Path $BackendPath $PythonRelPath
    }

    $pyExe = (Resolve-Path $pyExe).Path

    $uvicornInstalled = $false
    try {
      & $pyExe -m uvicorn --version > $null 2>&1
      if ($LASTEXITCODE -eq 0) { $uvicornInstalled = $true }
    } catch {
      $uvicornInstalled = $false
    }

    if ($Force -or -not $uvicornInstalled) {
      Write-Host "[Dev] Installing backend dependencies" -ForegroundColor Cyan
      & $pyExe -m pip install --upgrade pip
      $req = if (Test-Path 'requirements-dev.txt') { 'requirements-dev.txt' } else { 'requirements.txt' }
      & $pyExe -m pip install -r $req
    }

    return $pyExe
  }
  finally {
    Pop-Location
  }
}

# 0) Unblock local scripts (no-op if already unblocked)
Get-ChildItem "$repo/scripts/*.ps1" -ErrorAction SilentlyContinue | Unblock-File | Out-Null

# 1) Backend venv bootstrap (host) before launching jobs (ensures uvicorn present)
$pythonExe = Use-BackendVenv -BackendPath "$repo/apps/backend" -PythonRelPath $Py -Force:$Bootstrap

# 2) Ollama + model (optional)
if (-not $NoOllama) {
  $ollama = Start-Job -Name Ollama -ScriptBlock {
    param($repo,$Model)
    Set-Location $repo
    & "$repo/scripts/run-ollama.ps1" -Model $Model
  } -ArgumentList $repo,$Model
}

# 3) Backend (uvicorn)
$backend = Start-Job -Name Backend -ScriptBlock {
  param($repo,$PythonExe)
  Set-Location "$repo/apps/backend"
  # Prefer Postgres in dev (matches docker-compose postgres service)
  $env:DATABASE_URL = "postgresql+psycopg://myuser:password@localhost:5432/finance"
  $env:APP_ENV = "dev"
  $env:PYTHONNOUSERSITE = "1"
  Write-Host "[Backend] Using DATABASE_URL=$env:DATABASE_URL"
  & $PythonExe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
} -ArgumentList $repo,$pythonExe

# 4) Frontend (pnpm dev)
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
if ($NoOllama) {
  Receive-Job -Name Backend,Frontend -Wait
} else {
  Receive-Job -Name Ollama,Backend,Frontend -Wait
}


