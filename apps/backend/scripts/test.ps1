param(
  [switch]$Hermetic = $false,
  [string]$PytestArgs = "",
  [switch]$FullTests = $false,
  [switch]$Fast = $false, # Skip dependency reinstall if venv already exists
  # Optional explicit python interpreter. If not provided we'll auto-detect
  [string]$Py
)

<#
Usage examples:
  # Normal (installs/updates deps each run if needed)
  ./scripts/test.ps1 -PytestArgs "tests/test_file.py"

  # Fast mode (reuse existing venv + deps; much quicker for iterative runs)
  ./scripts/test.ps1 -Fast -PytestArgs "tests/test_file.py::test_case"

Notes:
  -Fast only affects the non-hermetic path. Hermetic mode (-Hermetic or HERMETIC env)
  already short-circuits dependency work.
  If you add new packages to requirements files you must run without -Fast once
  (or delete the .venv) so they are installed.
#>

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

# Always set PYTHONPATH so sitecustomize.py loads. Use repo root (parent of backend) to avoid double apps/backend/apps/backend when invoked from backend dir.
try {
  $repoRootCandidate = (& git rev-parse --show-toplevel 2>$null)
} catch { $repoRootCandidate = '' }
if ($repoRootCandidate -and (Test-Path $repoRootCandidate)) {
  $resolvedBackend = Join-Path $repoRootCandidate 'apps/backend'
} else {
  # Fallback: parent of script directory is backend root already
  $resolvedBackend = $backendRoot
}
if (-not (Test-Path $resolvedBackend)) { throw "Unable to resolve backend root for PYTHONPATH: $resolvedBackend" }
$env:PYTHONPATH = $resolvedBackend

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
  # Always include standard tests directory so new tests (e.g., edge metrics) run in hermetic CI when enabled
  if ($FullTests) {
    $hermeticArgs += 'apps/backend/tests'
  }
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
if (-not $Hermetic) {
  Write-Host "[bootstrap] Simplified non-hermetic path" -ForegroundColor Cyan
  $venvRoot = Join-Path $BACKEND '.venv'
  $venvPython = Join-Path $venvRoot 'Scripts/python.exe'
  $firstCreate = $false
  if (-not (Test-Path $venvPython)) {
    $basePy = (Get-Command python -ErrorAction SilentlyContinue).Source
    if (-not $basePy) { throw 'No system python found for venv creation' }
    Write-Host "[venv] Creating virtualenv ($basePy)" -ForegroundColor Yellow
    & $basePy -m venv $venvRoot
    $firstCreate = $true
  }
  $Py = $venvPython

  if ($Fast -and -not $firstCreate) {
    Write-Host "[fast] Skipping dependency reinstall (reuse existing venv)" -ForegroundColor DarkCyan
  } else {
    # Minimal bootstrap / upgrade path
    & $Py -m pip --version 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) {
      Write-Host "[deps] pip missing; running ensurepip" -ForegroundColor Yellow
      & $Py -m ensurepip --upgrade
    }
    & $Py -m pip install --upgrade pip setuptools wheel
    $reqDev = Join-Path $BACKEND 'requirements-dev.txt'
    if (Test-Path $reqDev) {
      Write-Host "[deps] Installing dev requirements" -ForegroundColor Cyan
      & $Py -m pip install -r $reqDev
    } else {
      Write-Host "[deps] WARNING requirements-dev.txt not found; installing base project deps" -ForegroundColor Yellow
      $reqTxt = Join-Path $BACKEND 'requirements.txt'
      if (Test-Path $reqTxt) { & $Py -m pip install -r $reqTxt }
    }
    if ($Fast -and -not $firstCreate) { Write-Host "[fast] (Info) Fast ignored because first run requires ensuring deps" -ForegroundColor DarkGray }
    Write-Host "[bootstrap] Completed dependency install" -ForegroundColor Cyan
  }
  $env:PYTHONPATH = "$BACKEND;$ROOT"
  $env:APP_ENV = 'test'
  if (-not $env:DEV_ALLOW_NO_LLM) { $env:DEV_ALLOW_NO_LLM = '1' }
}

# Hermetic path variables if needed beyond this point (non-hermetic already handled)
$root = $ROOT
Set-Location $ROOT

if ($Hermetic) {
  Write-Host "[deps] Skipped install (hermetic mode)" -ForegroundColor DarkGray
}

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
# Auto-prefix relative backend test paths (tests/... or hermetic_tests/...) since we chdir to repo root
for ($i = 0; $i -lt $finalArgs.Count; $i++) {
  $tok = $finalArgs[$i]
  if ($tok -and ($tok -notlike '-*')) {
    if ($tok -match '^(tests|hermetic_tests)[/\\]') {
      # Preserve entire token (may include ::nodeid) when prefixing
      $finalArgs[$i] = 'apps/backend/' + $tok
    }
  }
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
& $Py -m pytest @finalArgs @fileTargets

# Defensive guard (should never hit)
if ($env:HERMETIC -eq '1' -and -not $Hermetic) {
  Write-Host "[hermetic] FATAL: fell through to legacy path unexpectedly." -ForegroundColor Red
  exit 90
}
