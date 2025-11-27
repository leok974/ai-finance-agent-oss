# Setup GitHub branch protection for main branch
# Requires: gh CLI installed and authenticated with admin permissions

Write-Host "=== Setting up GitHub Branch Protection ===" -ForegroundColor Cyan
Write-Host ""

$repo = "leok974/ai-finance-agent-oss"
$branch = "main"

Write-Host "Repository: $repo"
Write-Host "Branch: $branch"
Write-Host ""

Write-Host "Applying protection rules..." -ForegroundColor Yellow

gh api `
  -X PUT `
  -H "Accept: application/vnd.github+json" `
  "repos/$repo/branches/$branch/protection" `
  -f required_status_checks.strict=true `
  -F required_status_checks.contexts[]='pre-commit' `
  -F required_status_checks.contexts[]='db-drift' `
  -F required_status_checks.contexts[]='help-selftest' `
  -F required_status_checks.contexts[]='backend-tests' `
  -F required_status_checks.contexts[]='web-tests' `
  -f enforce_admins=true `
  -f required_pull_request_reviews.dismiss_stale_reviews=true `
  -F required_pull_request_reviews.required_approving_review_count=1 `
  -f restrictions=null

Write-Host ""
Write-Host "✓ Branch protection configured!" -ForegroundColor Green
Write-Host ""
Write-Host "Required checks:"
Write-Host "  - pre-commit"
Write-Host "  - db-drift"
Write-Host "  - help-selftest"
Write-Host "  - backend-tests"
Write-Host "  - web-tests"
Write-Host ""
Write-Host "Verify at: https://github.com/$repo/settings/branches"
