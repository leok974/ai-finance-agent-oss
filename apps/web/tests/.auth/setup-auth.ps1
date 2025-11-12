# Playwright Auth Setup Script
# Sets environment variables and generates auth state for testing

param(
    [string]$Email = "",
    [string]$Password = "",
    [string]$BaseUrl = "https://app.ledger-mind.org"
)

Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  Playwright Auth State Setup" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

# Check if credentials are provided
if (-not $Email) {
    Write-Host "ERROR: Email is required" -ForegroundColor Red
    Write-Host ""
    Write-Host "Usage:" -ForegroundColor Yellow
    Write-Host "  .\setup-auth.ps1 -Email 'user@example.com' -Password 'yourpassword'" -ForegroundColor White
    Write-Host ""
    Write-Host "Or set environment variables manually:" -ForegroundColor Yellow
    Write-Host "  `$env:PW_EMAIL='user@example.com'" -ForegroundColor White
    Write-Host "  `$env:PW_PASSWORD='yourpassword'" -ForegroundColor White
    Write-Host "  `$env:BASE_URL='https://app.ledger-mind.org'" -ForegroundColor White
    Write-Host "  pnpm --dir apps/web exec playwright test --list" -ForegroundColor White
    exit 1
}

if (-not $Password) {
    Write-Host "ERROR: Password is required" -ForegroundColor Red
    exit 1
}

# Set environment variables
$env:PW_EMAIL = $Email
$env:PW_PASSWORD = $Password
$env:BASE_URL = $BaseUrl

Write-Host "Setting credentials..." -ForegroundColor Green
Write-Host "  Email:    $Email" -ForegroundColor White
Write-Host "  Password: $('*' * $Password.Length)" -ForegroundColor White
Write-Host "  Base URL: $BaseUrl" -ForegroundColor White
Write-Host ""

# Change to web directory
Push-Location apps/web

try {
    Write-Host "Running global setup (this will log in and save auth state)..." -ForegroundColor Yellow
    Write-Host ""
    
    # Run playwright test --list to trigger global setup
    pnpm exec playwright test --list 2>&1 | Select-Object -First 20
    
    Write-Host ""
    
    # Check if auth state was created
    if (Test-Path "tests/.auth/storageState.json") {
        Write-Host "✓ Auth state created successfully!" -ForegroundColor Green
        Write-Host "  Location: apps/web/tests/.auth/storageState.json" -ForegroundColor White
        Write-Host ""
        Write-Host "You can now run tests:" -ForegroundColor Cyan
        Write-Host "  pnpm --dir apps/web exec playwright test 'chat.*.spec.ts'" -ForegroundColor White
        Write-Host ""
    } else {
        Write-Host "✗ Auth state not created" -ForegroundColor Red
        Write-Host "  Check the output above for errors" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "Common issues:" -ForegroundColor Yellow
        Write-Host "  - Invalid credentials" -ForegroundColor White
        Write-Host "  - Backend not running" -ForegroundColor White
        Write-Host "  - Network connectivity" -ForegroundColor White
        exit 1
    }
} finally {
    Pop-Location
}

Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Cyan
