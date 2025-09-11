param([switch]$OpenBrowser)

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $repoRoot

# --- Backend (FastAPI) ---
$backendCmd = @"
Set-Location "$repoRoot\apps\backend"
`$env:APP_ENV="dev"
`$env:COOKIE_SECURE="0"
`$env:COOKIE_SAMESITE="lax"
`$env:DEV_ALLOW_NO_AUTH="0"
`$env:DEV_ALLOW_NO_LLM="1"
`$env:PLANNER_BYPASS="1"
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
"@

Start-Process powershell -ArgumentList "-NoLogo","-NoExit","-Command",$backendCmd

# --- Frontend (Vite) ---
$frontendCmd = @"
Set-Location "$repoRoot\apps\web"
`$env:VITE_API_BASE="http://127.0.0.1:8000"
pnpm dev
"@

Start-Process powershell -ArgumentList "-NoLogo","-NoExit","-Command",$frontendCmd

if ($OpenBrowser.IsPresent) {
  Start-Sleep -Seconds 2
  Start-Process "http://127.0.0.1:5173/dev/plan"
}
