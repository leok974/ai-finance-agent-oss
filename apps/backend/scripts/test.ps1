param(
  [switch]$Hermetic = $false,
  [string]$PytestArgs = "",
  [switch]$FullTests = $false,
  # Optional explicit python interpreter. If not provided we'll auto-detect
  [string]$Py
)

# --- Interpreter resolution (post-param so we can use $PSScriptRoot) ---------
$backendRoot = Split-Path $PSScriptRoot -Parent
if (-not $PSBoundParameters.ContainsKey('Py') -or [string]::IsNullOrWhiteSpace($Py)) {
  $auto = Join-Path $backendRoot '.venv\Scripts\python.exe'
  if (Test-Path $auto) { $Py = $auto } else { $Py = (Get-Command python).Source }
  Write-Host "[py-detect] Auto-selected python: $Py" -ForegroundColor DarkGray
} else {
  Write-Host "[py-detect] User supplied -Py: $Py" -ForegroundColor DarkGray
  if (-not (Test-Path $Py)) {
    $candidate = Join-Path $backendRoot '.venv\Scripts\python.exe'
    if (Test-Path $candidate) {
      Write-Host "[py-detect] Provided -Py path missing. Falling back to backend venv: $candidate" -ForegroundColor Yellow
      $Py = $candidate
    } else {
      Write-Host "[py-detect] Provided -Py path missing and no backend venv; will fallback to system python." -ForegroundColor Yellow
      $Py = (Get-Command python).Source
    }
  }
}

Write-Host "[py-detect] Final python path: $Py" -ForegroundColor DarkGray

# --- Hermetic env detection (robust) ---------------------------------------
# Treat any non-empty, non-"0" HERMETIC value as truthy. This is more lenient
# than strict equality and defends against accidental whitespace or variants
# like "true" / "yes".
$rawHermeticEnv = $env:HERMETIC
if ($rawHermeticEnv) {
  $trimHermetic = $rawHermeticEnv.Trim()
  if ($trimHermetic -and $trimHermetic -ne '0') { $Hermetic = $true }
}

# Optional debug output (always shown for now; could gate behind HERMETIC_DEBUG)
Write-Host "[hermetic-detect] env:HERMETIC='${rawHermeticEnv}' => switch Hermetic=$Hermetic" -ForegroundColor DarkGray

# Always set PYTHONPATH so sitecustomize.py loads
$env:PYTHONPATH = (Resolve-Path 'apps/backend')

if ($Hermetic) {
  Write-Host "[hermetic] early short-circuit path engaged." -ForegroundColor Cyan
  $env:HERMETIC = '1'
  $env:HERMETIC_STUB_FASTAPI = '1'
  if (-not $env:HERMETIC_FORCE_STUB) { $env:HERMETIC_FORCE_STUB = 'annotated_types' }
  if (-not $env:HERMETIC_DEBUG) { $env:HERMETIC_DEBUG = '0' }
  $env:PYTEST_DISABLE_PLUGIN_AUTOLOAD = '1'
  $noPlugins = @('-p','no:pytest_httpx','-p','no:httpx','-p','no:ddtrace','-p','no:pytest_cov')
  $hermeticArgs = @()
  $hermeticArgs += $noPlugins
  $hermeticArgs += @('--maxfail','1','-q')
  $hermeticArgs += 'apps/backend/hermetic_tests'
  if ($FullTests) { $hermeticArgs += 'apps/backend/tests' }
  $hermeticArgs += @('-m','not heavy and not httpapi')
  if ($PytestArgs) { $hermeticArgs += ($PytestArgs -split ' +') }
  Write-Host "[hermetic] args: $($hermeticArgs -join ' ')" -ForegroundColor Cyan
  try {
    $tmpIso = New-TemporaryFile
    Set-Content -LiteralPath $tmpIso -Value "print('[hermetic] collection isolation OK')" -Encoding UTF8
    if (Test-Path $Py) { & $Py $tmpIso } else { python $tmpIso }
    Remove-Item $tmpIso -ErrorAction SilentlyContinue
  } catch { Write-Host "[hermetic] isolation probe skipped: $_" -ForegroundColor DarkYellow }
  if (Test-Path $Py) { & $Py -m pytest @hermeticArgs } else { python -m pytest @hermeticArgs }
  exit $LASTEXITCODE
}

<#
 Legacy (non-hermetic) path
 NOTE: Any hermetic-specific conditional code below has been removed; the hermetic
 branch exits earlier. Keeping this block lean reduces confusion and avoids PowerShell
 syntax pitfalls that previously arose from bash-style heredocs ("python - <<EOF") which
 triggered the "'<' operator is reserved for future use" error. If you reintroduce
 inline Python, prefer the New-TemporaryFile pattern already used above.
#>
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

# --- Ensure pip is available for the specified interpreter --------------------
function Invoke-PythonDiag {
  param([string]$Label = 'pre')
  try {
    $code = @'
import sys, importlib.util, os
print(f"[diag:{__name__}] label={os.environ.get('DIAG_LABEL')} exe={sys.executable}")
print('  version:', sys.version.replace('\n',' '))
print('  prefix:', sys.prefix, ' base_prefix:', sys.base_prefix)
print('  executable:', sys.executable)
print('  pip_spec:', importlib.util.find_spec('pip'))
print('  full_sys_path_count:', len(sys.path))
for i,p in enumerate(sys.path):
  if i < 12:
    print(f'    [{i}] {p}')
  elif i == 12:
    print('    ...')
'@
    $tmp = New-TemporaryFile
    Set-Content -LiteralPath $tmp -Value $code -Encoding UTF8
    $env:DIAG_LABEL = $Label
    & $Py $tmp 2>$null | ForEach-Object { Write-Host $_ -ForegroundColor DarkGray }
    Remove-Item $tmp -ErrorAction SilentlyContinue
  } catch { Write-Host "[diag] Failed to run diagnostics: $_" -ForegroundColor DarkYellow }
}

Invoke-PythonDiag -Label 'pre-pip'

try {
  & $Py -m pip --version 2>$null | Out-Null
} catch { }
if ($LASTEXITCODE -ne 0) {
  Write-Host "[deps] pip missing; bootstrapping via ensurepip" -ForegroundColor Yellow
  try { & $Py -m ensurepip --upgrade 2>$null | Out-Null } catch { Write-Host "[deps] ensurepip failed: $_" -ForegroundColor Red }
  # Fallback: direct ensurepip bootstrap invocation (guards against -m resolution issues)
  try { & $Py -c "import ensurepip; ensurepip.bootstrap(upgrade=True)" 2>$null | Out-Null } catch { }
  try { & $Py -m pip --version 2>$null | Out-Null } catch { }
}

if ($LASTEXITCODE -ne 0) {
  Write-Host "[deps] WARNING: pip still unavailable after ensurepip. Will attempt fallback execution path." -ForegroundColor Yellow
  Invoke-PythonDiag -Label 'pip-missing'
  $global:PipUnavailable = $true
} else {
  Invoke-PythonDiag -Label 'post-pip'
}

# --- Fallback dependency installation using base interpreter if pip module execution failing ---
if ($PipUnavailable) {
  try {
    # Derive base python from pyvenv.cfg (already shows base_prefix in diag; safer to parse file)
    $pyvenv = Join-Path (Split-Path $Py -Parent -Parent) 'pyvenv.cfg'
    $basePython = $null
    if (Test-Path $pyvenv) {
      $homeLine = (Get-Content $pyvenv | Where-Object { $_ -match '^home *= *' })
      if ($homeLine) {
        $baseHome = $homeLine -replace '^home *= *',''
        $candidate = Join-Path $baseHome 'python.exe'
        if (Test-Path $candidate) { $basePython = $candidate }
      }
    }
    if (-not $basePython) { $basePython = (Get-Command python).Source }
    Write-Host "[fallback] base python: $basePython" -ForegroundColor DarkYellow
    $reqDev = Join-Path $backendRoot 'requirements-dev.txt'
    if (Test-Path $reqDev) {
      $target = Join-Path $backendRoot '.venv/Lib/site-packages'
      Write-Host "[fallback] Installing dev requirements into target: $target" -ForegroundColor DarkYellow
      & $basePython -m pip install --upgrade pip setuptools wheel 2>$null | Out-Null
      & $basePython -m pip install -r $reqDev --target $target 2>$null | Out-Null
      Write-Host "[fallback] Install complete (target mode)." -ForegroundColor DarkYellow
      # Re-probe for iniconfig to short-circuit repeated attempts later
      try { & $Py -c "import iniconfig,pytest; print('fallback import ok')" 2>$null | Out-Null } catch { Write-Host "[fallback] Import probe warning: $_" -ForegroundColor DarkYellow }
    } else {
      Write-Host "[fallback] requirements-dev.txt not found; skipping target install" -ForegroundColor Red
    }
  } catch {
    Write-Host "[fallback] ERROR during base interpreter target install: $_" -ForegroundColor Red
  }
}

# 1) Make sure source tree wins on sys.path (front of PYTHONPATH)
$env:PYTHONPATH = "$BACKEND;$ROOT"

# 2) Kill all bytecode caches
Get-ChildItem -Path $ROOT -Recurse -Directory -Filter "__pycache__" 2>$null | ForEach-Object { Remove-Item $_.FullName -Recurse -Force -ErrorAction SilentlyContinue }
Get-ChildItem -Path $ROOT -Recurse -Filter "*.pyc" 2>$null | ForEach-Object { Remove-Item $_.FullName -Force -ErrorAction SilentlyContinue }

# 3) Prevent new .pyc during tests (optional but recommended for hermetic determinism)
$env:PYTHONDONTWRITEBYTECODE = "1"

# 4) Ensure no old installed distributions shadow the source (best-effort)
if (-not $Hermetic) {
  try {
    $pyCmd = if (Test-Path $Py) { $Py } else { (Get-Command python).Source }
    $pkgListJson = & $pyCmd -m pip list --format=json 2>$null
    if ($LASTEXITCODE -eq 0 -and $pkgListJson) {
      $pkgs = $pkgListJson | ConvertFrom-Json | Where-Object { $_.name -match '^(ledger-?mind|finance-agent-backend|ai-finance-agent|app)$' }
      foreach ($p in $pkgs) { & $pyCmd -m pip uninstall -y $p.name | Out-Null }
    }
  } catch { }
}

try {
  $diagPy = @'
import importlib, sys
print("PYTHONPATH (head):", sys.path[:5])
mod = importlib.import_module("app.services.agent_tools")
print("agent_tools file:", getattr(mod, "__file__", None))
print("Legacy (non-hermetic) preflight complete.")
'@
  $tmpPy = New-TemporaryFile
  Set-Content -LiteralPath $tmpPy -Value $diagPy -Encoding UTF8
  if (Test-Path $Py) { & $Py $tmpPy } else { python $tmpPy }
  Remove-Item $tmpPy -ErrorAction SilentlyContinue
} catch { Write-Host "[preflight] Skipped diagnostics: $_" }
# (Retain $root for backward compatibility with legacy lines below)
$root = $ROOT
Set-Location $ROOT

# Hermetic test env
# Core test env flags
$env:APP_ENV = "test"

# Auth/CSRF bypass should be opt-in; enable only if ALLOW_NO_AUTH=1 provided by caller or Hermetic mode.
if ($env:ALLOW_NO_AUTH -eq '1' -or $Hermetic) {
  if (-not $env:DEV_ALLOW_NO_AUTH) { $env:DEV_ALLOW_NO_AUTH = '1' }
  if (-not $env:DEV_ALLOW_NO_CSRF) { $env:DEV_ALLOW_NO_CSRF = '1' }
  Write-Host "[auth-bypass] Enabled (ALLOW_NO_AUTH=${env:ALLOW_NO_AUTH}; Hermetic=$Hermetic)" -ForegroundColor DarkYellow
} else {
  # Ensure we don't silently leak previous shell value
  Remove-Item Env:DEV_ALLOW_NO_AUTH -ErrorAction SilentlyContinue
  Remove-Item Env:DEV_ALLOW_NO_CSRF -ErrorAction SilentlyContinue
  Write-Host "[auth-bypass] Disabled (default secure mode)" -ForegroundColor DarkGray
}
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

# Re-run dependency installation now that an interpreter is guaranteed
if (-not $Hermetic) {
  try {
    $reqDev = Join-Path $BACKEND 'requirements-dev.txt'
    if (Test-Path $reqDev) {
      $pythonExe = if (Test-Path $Py) { $Py } elseif (Get-Command python -ErrorAction SilentlyContinue) { (Get-Command python).Source } else { $null }
      if ($null -ne $pythonExe) {
        # Quick probe: if 'iniconfig' (pytest dep) missing, force dependency reinstall
        & $pythonExe -c "import iniconfig" 2>$null
        if ($LASTEXITCODE -ne 0) { $ForceDeps = $true; Write-Host "[deps] forcing install (iniconfig missing)" -ForegroundColor Yellow }
        $cacheDir = Join-Path $BACKEND '.cache'
        if (-not (Test-Path $cacheDir)) { New-Item -ItemType Directory -Path $cacheDir | Out-Null }
        $pyVersion = & $pythonExe -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}')" 2>$null
        $hashInput = @(
          (Get-Content $reqDev -Raw),
          $pyVersion
        ) -join "\n--SEP--\n"
        $hash = [System.BitConverter]::ToString((New-Object System.Security.Cryptography.SHA256Managed).ComputeHash([System.Text.Encoding]::UTF8.GetBytes($hashInput))).Replace('-','').Substring(0,32)
        $hashFile = Join-Path $cacheDir 'requirements-dev.hash'
        $prevHash = if (Test-Path $hashFile) { (Get-Content $hashFile -Raw).Trim() } else { '' }
        if ($ForceDeps -or $hash -ne $prevHash) {
          if (-not $PipUnavailable) {
            Write-Host "[deps] Installing dev dependencies (hash miss or forced)" -ForegroundColor Cyan
            & $pythonExe -m pip install -r $reqDev 2>$null | Out-Null
          } else {
            Write-Host "[deps] Skipping direct pip install due to earlier pip unavailability (fallback already attempted)." -ForegroundColor DarkYellow
          }
          Set-Content -LiteralPath $hashFile -Value $hash -Encoding ASCII
        } else {
          Write-Host "[deps] Cache hit (requirements-dev unchanged for Python $pyVersion)" -ForegroundColor DarkGreen
        }
      } else {
        Write-Host "[deps] Skipped install - no Python interpreter resolved" -ForegroundColor DarkYellow
      }
    }
  } catch { Write-Host "[deps] install warning: $_" -ForegroundColor DarkYellow }
} else {
  Write-Host "[deps] Skipped install (hermetic mode)" -ForegroundColor DarkYellow
}

## (Hermetic bootstrap removed here; hermetic path already exited.)

## (Removed duplicate legacy prelude block below; initial setup above already handled caches, PYTHONPATH, env flags.)

# Build optional -k expression from -Pattern
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

# Hermetic marker filtering (skip heavy/httpapi by default)
if ($Hermetic) {
  $finalArgs += @('-m', 'not heavy and not httpapi')
  $env:HERMETIC = '1'
  if (-not $env:HERMETIC_FORCE_STUB) { $env:HERMETIC_FORCE_STUB = 'annotated_types' }
  $hermeticDir = Join-Path $BACKEND 'hermetic_tests'
  if (Test-Path $hermeticDir) { $finalArgs += $hermeticDir } else { Write-Host "[warn] hermetic_tests directory missing" -ForegroundColor Yellow }
}

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
if ($PipUnavailable) {
  # Fallback: attempt to locate pytest.exe wrapper in Scripts and execute directly.
  $pytestExe = Join-Path (Split-Path $Py -Parent) 'pytest.exe'
  if (Test-Path $pytestExe) {
    Write-Host "[pytest-fallback] Executing $pytestExe directly (pip module absent)" -ForegroundColor Yellow
    & $pytestExe @finalArgs @fileTargets
  } else {
    Write-Host "[pytest-fallback] ERROR: pytest.exe not found; cannot run tests without pip." -ForegroundColor Red
    exit 3
  }
} else {
  & $py -m pytest @finalArgs @fileTargets
}

# Defensive guard (should never hit)
if ($env:HERMETIC -eq '1' -and -not $Hermetic) {
  Write-Host "[hermetic] FATAL: fell through to legacy path unexpectedly." -ForegroundColor Red
  exit 90
}
