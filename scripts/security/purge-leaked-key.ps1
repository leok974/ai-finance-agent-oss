# Git History Cleanup Script
# CRITICAL: Run this to remove gcp-dbt-sa.json from Git history

# Prerequisites:
# pip install git-filter-repo

Write-Host "🚨 SECURITY REMEDIATION: Removing leaked GCP key from Git history" -ForegroundColor Red
Write-Host ""

# Confirm current directory
$repoRoot = Get-Location
Write-Host "Repository root: $repoRoot" -ForegroundColor Yellow
Write-Host ""

# Safety check
$gitStatus = git status --porcelain
if ($gitStatus) {
    Write-Host "❌ ERROR: Working directory has uncommitted changes." -ForegroundColor Red
    Write-Host "Please commit or stash changes before running this script." -ForegroundColor Red
    exit 1
}

Write-Host "✅ Working directory clean" -ForegroundColor Green
Write-Host ""

# Backup current branch
$currentBranch = git branch --show-current
Write-Host "Current branch: $currentBranch" -ForegroundColor Cyan

# Create backup branch
$backupBranch = "backup-before-filter-repo-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
git branch $backupBranch
Write-Host "✅ Created backup branch: $backupBranch" -ForegroundColor Green
Write-Host ""

# Verify git-filter-repo is installed
try {
    $filterRepoVersion = git filter-repo --version 2>&1
    Write-Host "✅ git-filter-repo installed: $filterRepoVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ ERROR: git-filter-repo not found" -ForegroundColor Red
    Write-Host "Install with: pip install git-filter-repo" -ForegroundColor Yellow
    exit 1
}
Write-Host ""

# Final confirmation
Write-Host "⚠️  WARNING: This will rewrite Git history" -ForegroundColor Yellow
Write-Host "   - File to remove: gcp-dbt-sa.json" -ForegroundColor Yellow
Write-Host "   - Backup branch: $backupBranch" -ForegroundColor Yellow
Write-Host "   - Force push required after this operation" -ForegroundColor Yellow
Write-Host ""
$confirm = Read-Host "Type 'YES' to proceed"

if ($confirm -ne "YES") {
    Write-Host "❌ Aborted by user" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "🔄 Running git filter-repo..." -ForegroundColor Cyan

# Remove the file from history
git filter-repo --invert-paths --path gcp-dbt-sa.json --force

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Git history rewritten successfully" -ForegroundColor Green
    Write-Host ""

    # Verify file is gone
    Write-Host "🔍 Verifying removal..." -ForegroundColor Cyan
    $logCheck = git log --all --full-history --source --follow -- gcp-dbt-sa.json 2>&1

    if ($logCheck -match "fatal: ambiguous argument" -or $logCheck -match "does not have any commits yet") {
        Write-Host "✅ File successfully removed from history" -ForegroundColor Green
    } else {
        Write-Host "⚠️  WARNING: File may still exist in history" -ForegroundColor Yellow
        Write-Host "Log output: $logCheck" -ForegroundColor Yellow
    }

    Write-Host ""
    Write-Host "📋 NEXT STEPS:" -ForegroundColor Cyan
    Write-Host "1. Review changes: git log --oneline -20" -ForegroundColor White
    Write-Host "2. Force push: git push --force --prune origin HEAD:main" -ForegroundColor White
    Write-Host "3. Notify team to re-clone repository" -ForegroundColor White
    Write-Host "4. Delete backup branch after verification: git branch -D $backupBranch" -ForegroundColor White
    Write-Host ""
    Write-Host "⚠️  Remember to also:" -ForegroundColor Yellow
    Write-Host "   - Disable/delete the GCP key in GCP Console" -ForegroundColor Yellow
    Write-Host "   - Enable GitHub secret scanning + push protection" -ForegroundColor Yellow
    Write-Host "   - Delete affected GitHub Actions artifacts" -ForegroundColor Yellow

} else {
    Write-Host "❌ ERROR: git filter-repo failed" -ForegroundColor Red
    Write-Host "Restore backup: git checkout $backupBranch" -ForegroundColor Yellow
    exit 1
}
