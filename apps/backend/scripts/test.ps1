# Runs backend pytest with hermetic flags enabled for Windows PowerShell
# Enhanced preamble to guarantee source tree precedence and eliminate stale bytecode.
param(
  [string]$Py = ".venv/\Scripts/\python.exe",
  [string]$PytestArgs = "-q",
  # Comma or space separated patterns to pass to pytest -k (OR semantics). Example: -Pattern "onboarding,db_fallback"
  [string]$Pattern,
  # If set, treat Pattern tokens as AND terms instead of OR, building an expression token1 and token2 ...
  [switch]$PatternAll,
  # Force reinstall of dev dependencies even if cache hash matches
  [switch]$ForceDeps,
  # Optional explicit test file list (comma or space separated). Relative paths resolved from backend root.
  [string]$Files
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

# Ensure venv python exists (optional fast path)
if (-not (Test-Path $Py)) {
  if (Test-Path .venv/\Scripts/\Activate.ps1) { . .venv/\Scripts/\Activate.ps1; $Py = "$env:VIRTUAL_ENV/\Scripts/\python.exe" }
}

# Early install dev requirements to guarantee crypto/FastAPI present (with caching)
try {
  $reqDev = Join-Path $BACKEND 'requirements-dev.txt'
  if (Test-Path $reqDev -and (Test-Path $Py)) {
    $cacheDir = Join-Path $BACKEND '.cache'
    if (-not (Test-Path $cacheDir)) { New-Item -ItemType Directory -Path $cacheDir | Out-Null }
    $pyVersion = & $Py -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}')" 2>$null
    $hashInput = @(
      (Get-Content $reqDev -Raw),
      $pyVersion
    ) -join "\n--SEP--\n"
    $hash = [System.BitConverter]::ToString((New-Object System.Security.Cryptography.SHA256Managed).ComputeHash([System.Text.Encoding]::UTF8.GetBytes($hashInput))).Replace('-','').Substring(0,32)
    $hashFile = Join-Path $cacheDir 'requirements-dev.hash'
    $prevHash = if (Test-Path $hashFile) { (Get-Content $hashFile -Raw).Trim() } else { '' }
    if ($ForceDeps -or $hash -ne $prevHash) {
      Write-Host "[deps] Installing dev dependencies (hash miss or forced)" -ForegroundColor Cyan
      & $Py -m pip install -r $reqDev | Out-Null
      Set-Content -LiteralPath $hashFile -Value $hash -Encoding ASCII
    } else {
      Write-Host "[deps] Cache hit (requirements-dev unchanged for Python $pyVersion)" -ForegroundColor DarkGreen
    }
  }
} catch { Write-Host "[deps] install warning: $_" -ForegroundColor DarkYellow }

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
  Write-Host "[venv] Python not found at expected path: $Py" -ForegroundColor Yellow
  if (Test-Path .venv/\Scripts/\Activate.ps1) {
    Write-Host "[venv] Activating existing .venv..." -ForegroundColor Yellow
    . .venv/\Scripts/\Activate.ps1; $Py = "$env:VIRTUAL_ENV/\Scripts/\python.exe"
  } elseif (Get-Command python -ErrorAction SilentlyContinue) {
    Write-Host "[venv] Falling back to system python: $(Get-Command python).Source" -ForegroundColor DarkYellow
    $Py = (Get-Command python).Source
  } else {
    Write-Host "[venv] ERROR: No Python interpreter available. Create a venv with 'python -m venv .venv' first." -ForegroundColor Red
    exit 2
  }
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

# 3) Uninstall stale distributions (prefer venv python if available)
if (Test-Path $Py) { $py = $Py } else { $py = (Get-Command python).Source }
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
# Allow explicit override of LLM usage in tests: if FORCE_LLM_TESTS=1 then do NOT disable LLM path
if ($env:FORCE_LLM_TESTS -eq '1') {
  # ensure disabling flag removed
  if ($env:DEV_ALLOW_NO_LLM) { Remove-Item Env:DEV_ALLOW_NO_LLM }
} elseif (-not $env:DEV_ALLOW_NO_LLM) { $env:DEV_ALLOW_NO_LLM = '1' }

# 6) Build optional -k expression from -Pattern
$kExpr = $null
if ($Pattern) {
  # Split on comma or whitespace
  $rawTokens = $Pattern -split "[\s,]+" | Where-Object { $_ -and $_.Trim().Length -gt 0 } | Sort-Object -Unique
  if ($rawTokens.Count -gt 0) {
    # Escape single quotes in tokens for safety (pytest -k uses eval-like parsing for quotes)
    $escaped = $rawTokens | ForEach-Object { $_.Replace("'", "") }
    # pytest -k expects identifiers / substrings without quotes unless complex boolean precedence is needed.
    # We'll only wrap in quotes if token has non-word characters other than dash or underscore.
    $norm = $escaped | ForEach-Object {
      if ($_ -match "^[A-Za-z0-9_\-]+$") { $_ } else { '"' + $_ + '"' }
    }
    if ($PatternAll) {
      # All tokens must match
      $kExpr = ($norm) -join " and "
    } else {
      # Any token matches
      $kExpr = ($norm) -join " or "
    }
  }
}

# Allow user-specified additional pytest args while preserving hermetic defaults
$finalArgs = @()
if ($PytestArgs) {
  # Naively split on spaces unless quoted (simple parser)
  $finalArgs += ($PytestArgs -split ' +')
}
if (-not ($finalArgs | Where-Object { $_ -like '-q*' })) {
  # Ensure quiet by default if user didn't override
  $finalArgs += '-q'
}
if ($kExpr) { $finalArgs += @('-k', $kExpr) }

# Append explicit file targets if provided
$fileTargets = @()
if ($Files) {
  $fileTokens = $Files -split "[\s,]+" | Where-Object { $_ -and $_.Trim().Length -gt 0 }
  foreach ($f in $fileTokens) {
    # Normalize relative to backend root
    $p = if (Test-Path $f) { (Resolve-Path $f).Path } else { Join-Path $BACKEND $f }
    $fileTargets += $p
  }
}

Write-Host "[pytest] args: $($finalArgs -join ' ') $($fileTargets -join ' ')" -ForegroundColor Cyan
& $py -m pytest @finalArgs @fileTargets
