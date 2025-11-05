#!/bin/bash
# Git History Cleanup Script - Complete Key Removal
# CRITICAL: Run this to remove gcp-dbt-sa.json from Git history
# Usage: bash scripts/security/history-purge.sh

set -euo pipefail

echo "🚨 SECURITY REMEDIATION: Removing leaked GCP key from Git history"
echo ""

# Confirm current directory
REPO_ROOT=$(pwd)
echo "Repository root: $REPO_ROOT"
echo ""

# Safety check - uncommitted changes
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
if ! python3 -m pip show git-filter-repo >/dev/null 2>&1; then
    echo "❌ ERROR: git-filter-repo not installed"
    echo "Install with: pip install git-filter-repo"
    exit 1
fi
echo "✅ git-filter-repo installed"
echo ""

# Check if file exists in history
echo "🔍 Checking if gcp-dbt-sa.json exists in history..."
if ! git log --all --full-history -- gcp-dbt-sa.json >/dev/null 2>&1; then
    echo "✅ File not found in history - no action needed"
    echo "If you recently purged, verify with: git log --all --oneline | grep -i gcp-dbt"
    exit 0
fi

echo "⚠️  File FOUND in history:"
COMMIT_COUNT=$(git log --all --oneline -- gcp-dbt-sa.json | wc -l)
echo "   Found in $COMMIT_COUNT commit(s)"
echo ""

# Final confirmation
echo "⚠️  WARNING: This will rewrite Git history"
echo "   - File to remove: gcp-dbt-sa.json"
echo "   - Commits affected: $COMMIT_COUNT"
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
python3 -m git_filter_repo --invert-paths --path gcp-dbt-sa.json --force

if [[ $? -eq 0 ]]; then
    echo "✅ Git history rewritten successfully"
    echo ""

    # Verify file is gone
    echo "🔍 Verifying removal..."
    if ! git log --all --full-history -- gcp-dbt-sa.json >/dev/null 2>&1; then
        echo "✅ File successfully removed from history"
    else
        echo "⚠️  WARNING: File may still exist in history"
        git log --all --oneline -- gcp-dbt-sa.json
    fi

    echo ""
    echo "📊 Repository statistics:"
    COMMIT_COUNT_AFTER=$(git rev-list --all --count)
    echo "   Total commits: $COMMIT_COUNT_AFTER"

    echo ""
    echo "📋 NEXT STEPS:"
    echo "1. Review changes: git log --oneline -20"
    echo "2. Force push to remote: git push --force --prune origin HEAD:main"
    echo "3. Notify team to re-clone repository"
    echo "4. Delete backup branch after verification: git branch -D $BACKUP_BRANCH"
    echo ""
    echo "⚠️  Remember to also:"
    echo "   - Disable/delete the GCP key in GCP Console"
    echo "   - Enable GitHub secret scanning + push protection"
    echo "   - Delete affected GitHub Actions artifacts"
    echo "   - Run: gitleaks detect --no-banner --redact"

else
    echo "❌ ERROR: git filter-repo failed (exit code: $?)"
    echo "Restore backup: git checkout $BACKUP_BRANCH"
    exit 1
fi
