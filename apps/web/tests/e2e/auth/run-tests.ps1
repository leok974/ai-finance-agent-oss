# Auth E2E Test Runner
# Run all authentication E2E tests against local or production environment

param(
    [string]$BaseUrl = "http://127.0.0.1",
    [switch]$Headed,
    [switch]$Debug,
    [string]$Test = "tests/e2e/auth",
    [int]$Workers = 4
)

Write-Host "🧪 Running Auth E2E Tests" -ForegroundColor Cyan
Write-Host "Base URL: $BaseUrl" -ForegroundColor Yellow

$env:BASE_URL = $BaseUrl

$playwrightArgs = @(
    "exec",
    "playwright",
    "test",
    $Test,
    "--project=chromium",
    "--workers=$Workers",
    "--reporter=line"
)

if ($Headed) {
    $playwrightArgs += "--headed"
}

if ($Debug) {
    $playwrightArgs += "--debug"
}

Write-Host "Command: pnpm -C apps/web $($playwrightArgs -join ' ')" -ForegroundColor Gray
Write-Host ""

pnpm -C apps/web @playwrightArgs

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✅ All tests passed!" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "❌ Some tests failed (exit code: $LASTEXITCODE)" -ForegroundColor Red
    Write-Host "View report: pnpm -C apps/web exec playwright show-report" -ForegroundColor Yellow
}

exit $LASTEXITCODE
