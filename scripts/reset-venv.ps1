param(
  [string]$PyVersion = '3.11'
)
$ErrorActionPreference = 'Stop'
Write-Host '>>> Python environment reset (backend) starting' -ForegroundColor Cyan

# Locate Python
$python = $null
try { $python = (Get-Command python -ErrorAction SilentlyContinue).Source } catch {}
if (-not $python) {
  try { $pyCmd = Get-Command py -ErrorAction SilentlyContinue; if($pyCmd){ $python = "py -$PyVersion" } } catch {}
}
if (-not $python) { throw 'Python not found on PATH (need python or py launcher).' }

# Repo sanity
if (-not (Test-Path .git)) { Write-Warning 'No .git directory detected (are you at repo root?)' }

$backendRoot = 'apps/backend'
if (-not (Test-Path $backendRoot)) { throw "Backend root $backendRoot not found" }
$venvPath = Join-Path $backendRoot '.venv'

Write-Host '>>> Removing old backend venv & caches' -ForegroundColor Cyan
if (Test-Path $venvPath) { Remove-Item $venvPath -Recurse -Force }
foreach($c in '.pytest_cache','.tox','.ruff_cache','.mypy_cache','.pip-cache') {
  $full = Join-Path $backendRoot $c
  if (Test-Path $full) { Remove-Item $full -Recurse -Force -ErrorAction SilentlyContinue }
}

# Create new venv
Write-Host '>>> Creating fresh venv' -ForegroundColor Cyan
& $python -m venv $venvPath

$venvPy = Join-Path $venvPath 'Scripts/python.exe'
$venvPip = Join-Path $venvPath 'Scripts/pip.exe'
if (-not (Test-Path $venvPy)) { throw 'Venv python missing after creation.' }
if (-not (Test-Path $venvPip)) { Write-Warning 'pip missing in venv, bootstrapping via ensurepip'; & $venvPy -m ensurepip --upgrade }

# Upgrade core tooling
& $venvPy -m pip install --upgrade pip setuptools wheel | Out-Null

# Install combined requirements (runtime + dev)
$reqFile = Join-Path $backendRoot 'requirements.txt'
$devFile = Join-Path $backendRoot 'requirements-dev.txt'
if (-not (Test-Path $reqFile)) { throw 'requirements.txt missing in backend.' }
if (-not (Test-Path $devFile)) { throw 'requirements-dev.txt missing in backend.' }

Write-Host '>>> Installing backend requirements (single resolver run)' -ForegroundColor Cyan
& $venvPy -m pip install --no-cache-dir -r $reqFile -r $devFile

# Sanity import probe
Write-Host '>>> Verifying critical modules' -ForegroundColor Cyan
$probe = @'
import sys, pkgutil
mods = ["iniconfig","packaging","colorama","httpx","numpy","pandas","patsy","click","pytest"]
missing = [m for m in mods if not pkgutil.find_loader(m)]
print('Python:', sys.version)
print('Missing:', missing)
if missing: raise SystemExit(1)
'@
$tf = New-TemporaryFile
Set-Content -LiteralPath $tf -Value $probe -Encoding UTF8
& $venvPy $tf
$code = $LASTEXITCODE
Remove-Item $tf -ErrorAction SilentlyContinue
if ($code -ne 0) { throw 'Some required modules are still missing.' }

Write-Host '>>> Backend venv reset complete.' -ForegroundColor Green
$ErrorActionPreference = 'Stop'
Write-Host '>>> Detecting Python...'
$pythonCmd = $null
$python = Get-Command python -ErrorAction SilentlyContinue
if ($python) { $pythonCmd = 'python' } else {
  $py = Get-Command py -ErrorAction SilentlyContinue
  if ($py) { $pythonCmd = 'py -3.11' }
}
if (-not $pythonCmd) { throw 'Python not found on PATH. Install Python 3.11+' }
if (-not (Test-Path .\.git)) { Write-Warning 'Not at repo root (.git missing); continuing.' }

Write-Host '>>> Removing old venv & caches...'
if (Test-Path .\.venv) { Remove-Item .\.venv -Recurse -Force }
@('.pytest_cache','.tox','.ruff_cache','.mypy_cache','.pip-cache') | ForEach-Object { if (Test-Path $_) { Remove-Item $_ -Recurse -Force } }
$PipCache = Join-Path $env:LOCALAPPDATA 'pip\Cache'
if (Test-Path $PipCache) { Remove-Item $PipCache -Recurse -Force -ErrorAction SilentlyContinue }

Write-Host '>>> Creating venv...'
& $pythonCmd -m venv .venv
$venvPy = '.\\.venv\\Scripts\\python.exe'
$venvPip = '.\\.venv\\Scripts\\pip.exe'
if (-not (Test-Path $venvPip)) { Write-Warning 'pip missing in venv — running ensurepip'; & $venvPy -m ensurepip --upgrade }

Write-Host '>>> Upgrading bootstrap tooling (pip/setuptools/wheel)...'
& $venvPy -m pip install --upgrade pip setuptools wheel

# Determine requirement files
$req = Test-Path .\apps\backend\requirements.txt
$dev = Test-Path .\apps\backend\requirements-dev.txt
if (-not $req -and -not $dev) { throw 'No requirements files found.' }

Write-Host '>>> Installing requirements (runtime + dev unified)...'
$installArgs = @('install','--upgrade','--no-cache-dir')
if ($req) { $installArgs += @('-r','apps/backend/requirements.txt') }
if ($dev) { $installArgs += @('-r','apps/backend/requirements-dev.txt') }
& $venvPy -m pip @installArgs

Write-Host '>>> Verifying core imports...'
$verify = @'
import sys, pkgutil
print('Python:', sys.version)
req = ['iniconfig','packaging','colorama','httpx','numpy','pandas','patsy','click','pytest']
missing = [m for m in req if not pkgutil.find_loader(m)]
print('Missing:', missing)
if missing:
    raise SystemExit(1)
'@
$tf = New-TemporaryFile
Set-Content -LiteralPath $tf -Value $verify -Encoding UTF8
& $venvPy $tf
Remove-Item $tf -ErrorAction SilentlyContinue
Write-Host '>>> Environment OK.' -ForegroundColor Green

Write-Host 'Next: run .\.venv\Scripts\pytest.exe -q apps/backend/tests/test_version_content_length.py' -ForegroundColor Cyan
