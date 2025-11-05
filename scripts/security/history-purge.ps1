# Git History Cleanup Script - Complete Key Removal
# CRITICAL: Run this to remove gcp-dbt-sa.json from Git history
# Usage: .\scripts\security\history-purge.ps1

Write-Host "🚨 SECURITY REMEDIATION: Removing leaked GCP key from Git history" -ForegroundColor Red
Write-Host ""

# Confirm current directory
$repoRoot = Get-Location
Write-Host "Repository root: $repoRoot" -ForegroundColor Yellow
Write-Host ""

# Safety check - uncommitted changes
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
    $filterRepoCheck = python -m pip show git-filter-repo 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ ERROR: git-filter-repo not installed" -ForegroundColor Red
        Write-Host "Install with: pip install git-filter-repo" -ForegroundColor Yellow
        exit 1
    }
    Write-Host "✅ git-filter-repo installed" -ForegroundColor Green
} catch {
    Write-Host "❌ ERROR: Cannot verify git-filter-repo installation" -ForegroundColor Red
    Write-Host "Install with: pip install git-filter-repo" -ForegroundColor Yellow
    exit 1
}
Write-Host ""

# Check if file exists in history
Write-Host "🔍 Checking if gcp-dbt-sa.json exists in history..." -ForegroundColor Cyan
$historyCheck = git log --all --full-history -- gcp-dbt-sa.json 2>&1
if ($historyCheck -match "fatal: ambiguous argument" -or $historyCheck -eq "") {
    Write-Host "✅ File not found in history - no action needed" -ForegroundColor Green
    Write-Host "If you recently purged, verify with: git log --all --oneline | Select-String 'gcp-dbt'" -ForegroundColor Yellow
    exit 0
}

Write-Host "⚠️  File FOUND in history:" -ForegroundColor Yellow
$commitCount = (git log --all --oneline -- gcp-dbt-sa.json | Measure-Object -Line).Lines
Write-Host "   Found in $commitCount commit(s)" -ForegroundColor Yellow
Write-Host ""

# Final confirmation
Write-Host "⚠️  WARNING: This will rewrite Git history" -ForegroundColor Yellow
Write-Host "   - File to remove: gcp-dbt-sa.json" -ForegroundColor Yellow
Write-Host "   - Commits affected: $commitCount" -ForegroundColor Yellow
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

# Remove the file from history (use python -m for cross-platform compatibility)
python -m git_filter_repo --invert-paths --path gcp-dbt-sa.json --force

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Git history rewritten successfully" -ForegroundColor Green
    Write-Host ""

    # Verify file is gone
    Write-Host "🔍 Verifying removal..." -ForegroundColor Cyan
    $logCheck = git log --all --full-history -- gcp-dbt-sa.json 2>&1

    if ($logCheck -match "fatal: ambiguous argument" -or $logCheck -eq "") {
        Write-Host "✅ File successfully removed from history" -ForegroundColor Green
    } else {
        Write-Host "⚠️  WARNING: File may still exist in history" -ForegroundColor Yellow
        Write-Host "Log output: $logCheck" -ForegroundColor Yellow
    }

    Write-Host ""
    Write-Host "📊 Repository statistics:" -ForegroundColor Cyan
    $commitCountAfter = (git rev-list --all --count)
    Write-Host "   Total commits: $commitCountAfter" -ForegroundColor White

    Write-Host ""
    Write-Host "📋 NEXT STEPS:" -ForegroundColor Cyan
    Write-Host "1. Review changes: git log --oneline -20" -ForegroundColor White
    Write-Host "2. Force push to remote: git push --force --prune origin HEAD:main" -ForegroundColor White
    Write-Host "3. Notify team to re-clone repository" -ForegroundColor White
    Write-Host "4. Delete backup branch after verification: git branch -D $backupBranch" -ForegroundColor White
    Write-Host ""
    Write-Host "⚠️  Remember to also:" -ForegroundColor Yellow
    Write-Host "   - Disable/delete the GCP key in GCP Console" -ForegroundColor Yellow
    Write-Host "   - Enable GitHub secret scanning + push protection" -ForegroundColor Yellow
    Write-Host "   - Delete affected GitHub Actions artifacts" -ForegroundColor Yellow
    Write-Host "   - Run: gitleaks detect --no-banner --redact" -ForegroundColor Yellow

} else {
    Write-Host "❌ ERROR: git filter-repo failed (exit code: $LASTEXITCODE)" -ForegroundColor Red
    Write-Host "Restore backup: git checkout $backupBranch" -ForegroundColor Yellow
    exit 1
}
