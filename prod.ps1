param(
  [string]$ApiBase = "https://api.yourdomain.com",
  [string]$CookieDomain = "yourdomain.com",
  [switch]$Local,
  [switch]$OpenBrowser
)

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $repoRoot

# Compute cookie secure flag (prod needs HTTPS; local preview can't set Secure cookies)
$cookieSecure = if ($Local) { "0" } else { "1" }

# --- Backend (FastAPI) ---
$backendCmd = @"
Set-Location "$repoRoot\apps\backend"
`$env:APP_ENV="prod"
`$env:COOKIE_SECURE="$cookieSecure"
`$env:COOKIE_SAMESITE="lax"
`$env:COOKIE_DOMAIN="$CookieDomain"
`$env:DEV_ALLOW_NO_AUTH="0"
`$env:DEV_ALLOW_NO_LLM="0"
uvicorn app.main:app --host 0.0.0.0 --port 8000
"@

Start-Process powershell -ArgumentList "-NoLogo","-NoExit","-Command",$backendCmd

# --- Frontend ---
if ($Local.IsPresent) {
  # Local "prod-like" preview
  $frontendCmd = @"
Set-Location "$repoRoot\apps\web"
`$env:VITE_API_BASE="$ApiBase"
pnpm build
pnpm preview --host 127.0.0.1 --port 5173
"@
  Start-Process powershell -ArgumentList "-NoLogo","-NoExit","-Command",$frontendCmd
  if ($OpenBrowser.IsPresent) {
    Start-Sleep -Seconds 2
    Start-Process "http://127.0.0.1:5173"
  }
} else {
  # Build only (for real deploy — serve dist/ behind HTTPS elsewhere)
  $frontendCmd = @"
Set-Location "$repoRoot\apps\web"
`$env:VITE_API_BASE="$ApiBase"
pnpm build
"@
  Start-Process powershell -ArgumentList "-NoLogo","-NoExit","-Command",$frontendCmd
  Write-Host "`nBuild complete. Serve 'apps\web\dist' behind HTTPS with your web server." -ForegroundColor Green
}
