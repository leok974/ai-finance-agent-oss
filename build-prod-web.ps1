# Build production web with proper git metadata

$branch = git branch --show-current
$commit = git rev-parse --short HEAD
$buildId = "bld-$(Get-Date -Format 'yyMMddHHmmss')"

Write-Host "Building nginx with:" -ForegroundColor Cyan
Write-Host "  Branch: $branch" -ForegroundColor Green
Write-Host "  Commit: $commit" -ForegroundColor Green
Write-Host "  BuildID: $buildId" -ForegroundColor Green

$env:VITE_GIT_BRANCH = $branch
$env:VITE_GIT_COMMIT = $commit
$env:VITE_BUILD_BRANCH = $branch
$env:VITE_BUILD_COMMIT = $commit
$env:BUILD_ID = $buildId

docker compose -f docker-compose.prod.yml build nginx

if ($LASTEXITCODE -eq 0) {
    Write-Host "`nBuild successful! Restarting nginx..." -ForegroundColor Green
    docker compose -f docker-compose.prod.yml up -d nginx
} else {
    Write-Host "`nBuild failed!" -ForegroundColor Red
}
