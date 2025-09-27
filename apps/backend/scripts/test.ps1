param(
  [switch]$Hermetic = $false,
  [string]$PytestArgs = "",
  [switch]$FullTests = $false,
  [string]$Py = ".venv/\Scripts/\python.exe"
)

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

# Re-run dependency installation now that an interpreter is guaranteed
if (-not $Hermetic) {
  try {
    $reqDev = Join-Path $BACKEND 'requirements-dev.txt'
    if (Test-Path $reqDev) {
      $pythonExe = if (Test-Path $Py) { $Py } elseif (Get-Command python -ErrorAction SilentlyContinue) { (Get-Command python).Source } else { $null }
      if ($null -ne $pythonExe) {
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
          Write-Host "[deps] Installing dev dependencies (hash miss or forced)" -ForegroundColor Cyan
          & $pythonExe -m pip install -r $reqDev | Out-Null
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
& $py -m pytest @finalArgs @fileTargets

# Defensive guard (should never hit)
if ($env:HERMETIC -eq '1' -and -not $Hermetic) {
  Write-Host "[hermetic] FATAL: fell through to legacy path unexpectedly." -ForegroundColor Red
  exit 90
}
