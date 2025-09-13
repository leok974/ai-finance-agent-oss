# Runs backend pytest with hermetic flags enabled for Windows PowerShell
param(
  [string]$Py = ".venv/\Scripts/\python.exe",
  [string]$PytestArgs = "-q"
)
$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Split-Path -Parent $here
Set-Location $root

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

& $Py -m pytest $PytestArgs
