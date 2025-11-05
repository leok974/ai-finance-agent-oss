#!/bin/bash
# Git History Cleanup Script - Bash version
# CRITICAL: Run this to remove gcp-dbt-sa.json from Git history

set -euo pipefail

echo "🚨 SECURITY REMEDIATION: Removing leaked GCP key from Git history"
echo ""

# Confirm current directory
REPO_ROOT=$(pwd)
echo "Repository root: $REPO_ROOT"
echo ""

# Safety check
if [[ -n $(git status --porcelain) ]]; then
    echo "❌ ERROR: Working directory has uncommitted changes."
    echo "Please commit or stash changes before running this script."
    exit 1
fi

echo "✅ Working directory clean"
echo ""

# Backup current branch
CURRENT_BRANCH=$(git branch --show-current)
echo "Current branch: $CURRENT_BRANCH"

# Create backup branch
BACKUP_BRANCH="backup-before-filter-repo-$(date +%Y%m%d-%H%M%S)"
git branch "$BACKUP_BRANCH"
echo "✅ Created backup branch: $BACKUP_BRANCH"
echo ""

# Verify git-filter-repo is installed
if ! command -v git-filter-repo &> /dev/null; then
    echo "❌ ERROR: git-filter-repo not found"
    echo "Install with: pip install git-filter-repo"
    exit 1
fi

FILTER_REPO_VERSION=$(git filter-repo --version)
echo "✅ git-filter-repo installed: $FILTER_REPO_VERSION"
echo ""

# Final confirmation
echo "⚠️  WARNING: This will rewrite Git history"
echo "   - File to remove: gcp-dbt-sa.json"
echo "   - Backup branch: $BACKUP_BRANCH"
echo "   - Force push required after this operation"
echo ""
read -p "Type 'YES' to proceed: " CONFIRM

if [[ "$CONFIRM" != "YES" ]]; then
    echo "❌ Aborted by user"
    exit 1
fi

echo ""
echo "🔄 Running git filter-repo..."

# Remove the file from history
git filter-repo --invert-paths --path gcp-dbt-sa.json --force

echo "✅ Git history rewritten successfully"
echo ""

# Verify file is gone
echo "🔍 Verifying removal..."
if git log --all --full-history --source --follow -- gcp-dbt-sa.json 2>&1 | grep -q "does not have any commits yet"; then
    echo "✅ File successfully removed from history"
else
    LOG_CHECK=$(git log --all --full-history --source --follow -- gcp-dbt-sa.json 2>&1 || true)
    if [[ -z "$LOG_CHECK" ]] || [[ "$LOG_CHECK" == *"fatal: ambiguous argument"* ]]; then
        echo "✅ File successfully removed from history"
    else
        echo "⚠️  WARNING: File may still exist in history"
        echo "Log output: $LOG_CHECK"
    fi
fi

echo ""
echo "📋 NEXT STEPS:"
echo "1. Review changes: git log --oneline -20"
echo "2. Force push: git push --force --prune origin HEAD:main"
echo "3. Notify team to re-clone repository"
echo "4. Delete backup branch after verification: git branch -D $BACKUP_BRANCH"
echo ""
echo "⚠️  Remember to also:"
echo "   - Disable/delete the GCP key in GCP Console"
echo "   - Enable GitHub secret scanning + push protection"
echo "   - Delete affected GitHub Actions artifacts"
