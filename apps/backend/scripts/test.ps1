# Runs backend pytest with hermetic flags enabled for Windows PowerShell
# Enhanced preamble to guarantee source tree precedence and eliminate stale bytecode.
param(
  [string]$Py = ".venv/\Scripts/\python.exe",
  [string]$PytestArgs = "-q"
)
$ErrorActionPreference = 'Stop'

# Resolve repo roots (requires git available)
try {
  $ROOT    = (& git rev-parse --show-toplevel).Trim()
} catch {
  # Fallback: assume this script lives in apps/backend/scripts
  $ROOT = (Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path))
}
$BACKEND = Join-Path $ROOT 'apps\backend'

# 1) Make sure source tree wins on sys.path (front of PYTHONPATH)
$env:PYTHONPATH = "$BACKEND;$ROOT"

# 2) Kill all bytecode caches
Get-ChildItem -Path $ROOT -Recurse -Directory -Filter "__pycache__" 2>$null | ForEach-Object { Remove-Item $_.FullName -Recurse -Force -ErrorAction SilentlyContinue }
Get-ChildItem -Path $ROOT -Recurse -Filter "*.pyc" 2>$null | ForEach-Object { Remove-Item $_.FullName -Force -ErrorAction SilentlyContinue }

# 3) Prevent new .pyc during tests (optional but recommended for hermetic determinism)
$env:PYTHONDONTWRITEBYTECODE = "1"

# 4) Ensure no old installed distributions shadow the source (best-effort)
try {
  $pyCmd = if (Test-Path $Py) { $Py } else { (Get-Command python).Source }
  $pkgListJson = & $pyCmd -m pip list --format=json 2>$null
  if ($LASTEXITCODE -eq 0 -and $pkgListJson) {
    $pkgs = $pkgListJson | ConvertFrom-Json | Where-Object { $_.name -match '^(ledger-?mind|finance-agent-backend|ai-finance-agent|app)$' }
    foreach ($p in $pkgs) { & $pyCmd -m pip uninstall -y $p.name | Out-Null }
  }
} catch { }

# 5) Preflight diagnostics to confirm we import from the working tree
try {
  $diagPy = @"
import importlib, sys
print('PYTHONPATH (head):', sys.path[:5])
mod = importlib.import_module('app.services.agent_tools')
print('agent_tools file:', getattr(mod, '__file__', None))
from app.services.agent_tools import route_to_tool
print('route_to_tool present:', hasattr(mod, 'route_to_tool'))
print('Importing routers.agent ...')
agent_mod = importlib.import_module('app.routers.agent')
print('agent router file:', getattr(agent_mod, '__file__', None))
print('Done preflight.')
"@
  $tmpPy = New-TemporaryFile
  Set-Content -LiteralPath $tmpPy -Value $diagPy -Encoding UTF8
  if (Test-Path $Py) { & $Py $tmpPy } else { python $tmpPy }
  Remove-Item $tmpPy -ErrorAction SilentlyContinue
} catch { Write-Host "[preflight] Skipped diagnostics: $_" }
# (Retain $root for backward compatibility with legacy lines below)
$root = $ROOT
Set-Location $ROOT

# Hermetic test env
$env:APP_ENV = "test"
$env:DEV_ALLOW_NO_AUTH = "1"
$env:DEV_ALLOW_NO_CSRF = "1"
# Optional: force deterministic no-LLM
if (-not $env:DEV_ALLOW_NO_LLM) { $env:DEV_ALLOW_NO_LLM = "1" }

if (-not (Test-Path $Py)) {
  Write-Host "Python not found at $Py. Activating venv if exists..."
  if (Test-Path .venv/\Scripts/\Activate.ps1) { . .venv/\Scripts/\Activate.ps1; $Py = "$env:VIRTUAL_ENV/\Scripts/\python.exe" }
}

# (Legacy cleanup retained: explicit single-file removal harmless if still present)
try {
  $agentPyc = Join-Path $BACKEND 'app/routers/__pycache__/agent.cpython-313.pyc'
  if (Test-Path $agentPyc) { Remove-Item $agentPyc -ErrorAction SilentlyContinue }
} catch { }

# Fail fast
$ErrorActionPreference = 'Stop'

# Resolve roots
$ROOT    = (git rev-parse --show-toplevel)
$BACKEND = Join-Path $ROOT 'apps\backend'

Write-Host "== HERMETIC PRELUDE (ts=$(Get-Date -Format o)) =="

# 1) Force source precedence
$env:PYTHONPATH = "$BACKEND;$ROOT"

# 2) Purge caches
Get-ChildItem -Path $ROOT -Recurse -Directory -Filter "__pycache__" | ForEach-Object { Remove-Item $_.FullName -Recurse -Force -ErrorAction SilentlyContinue }
Get-ChildItem -Path $ROOT -Recurse -Filter "*.pyc" | ForEach-Object { Remove-Item $_.FullName -Force -ErrorAction SilentlyContinue }
$env:PYTHONDONTWRITEBYTECODE = "1"

# 3) Uninstall stale distributions
$py = (Get-Command python).Source
$patterns = 'ledger-mind','ledgermind','finance-agent-backend','ai-finance-agent','^app$'
try {
  $pipList = & $py -m pip list --format=json | ConvertFrom-Json
  foreach ($p in $pipList) {
    if ($patterns | Where-Object { $p.name -match $_ }) {
      Write-Host "Uninstalling stale dist: $($p.name) $($p.version)"
      & $py -m pip uninstall -y $p.name | Out-Null
    }
  }
} catch { Write-Host "[pip] list failed: $_" }

# 4) Preflight module origins
Write-Host "PYTHONPATH: $($env:PYTHONPATH)"
& $py -c "import sys,importlib; print('sys.path[0:3]=', sys.path[0:3]); import app.services.agent_tools as at; print('agent_tools file:', getattr(at,'__file__',None)); from app.services.agent_tools import route_to_tool; print('route_to_tool:', hasattr(at,'route_to_tool')); import app.routers.agent as ag; print('agent router file:', getattr(ag,'__file__',None))" 2>$null

# 5) Hermetic env flags
$env:APP_ENV = 'test'
$env:DEV_ALLOW_NO_AUTH = '1'
$env:DEV_ALLOW_NO_CSRF = '1'
if (-not $env:DEV_ALLOW_NO_LLM) { $env:DEV_ALLOW_NO_LLM = '1' }

# 6) Run pytest
& $py -m pytest -q
