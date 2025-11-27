#!/bin/bash
# Setup GitHub branch protection for main branch
# Requires: gh CLI installed and authenticated with admin permissions

set -e

echo "=== Setting up GitHub Branch Protection ==="
echo ""

REPO="leok974/ai-finance-agent-oss"
BRANCH="main"

echo "Repository: $REPO"
echo "Branch: $BRANCH"
echo ""

echo "Applying protection rules..."

gh api \
  -X PUT \
  -H "Accept: application/vnd.github+json" \
  "repos/$REPO/branches/$BRANCH/protection" \
  -f required_status_checks.strict=true \
  -F required_status_checks.contexts[]='pre-commit' \
  -F required_status_checks.contexts[]='db-drift' \
  -F required_status_checks.contexts[]='help-selftest' \
  -F required_status_checks.contexts[]='backend-tests' \
  -F required_status_checks.contexts[]='web-tests' \
  -f enforce_admins=true \
  -f required_pull_request_reviews.dismiss_stale_reviews=true \
  -F required_pull_request_reviews.required_approving_review_count=1 \
  -f restrictions=null

echo ""
echo "✓ Branch protection configured!"
echo ""
echo "Required checks:"
echo "  - pre-commit"
echo "  - db-drift"
echo "  - help-selftest"
echo "  - backend-tests"
echo "  - web-tests"
echo ""
echo "Verify at: https://github.com/$REPO/settings/branches"
