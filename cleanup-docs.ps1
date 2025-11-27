#!/usr/bin/env pwsh
# LedgerMind Documentation Cleanup Script
# Moves legacy docs to archive and deletes obsolete files per DOCS_AUDIT.md

$ErrorActionPreference = "Stop"

# Ensure docs/archive exists
New-Item -ItemType Directory -Force -Path "docs/archive" | Out-Null

# Get all markdown files from git
$allMdFiles = git ls-files '*.md'

# KEEP: Core docs (do not touch)
$keepFiles = @(
    'README.md',
    'DOCS_AUDIT.md',
    'docs/OVERVIEW.md',
    'docs/INFRASTRUCTURE.md',
    'docs/DEBUGGING_GUIDE.md',
    'docs/RELEASE_NOTES.md'
)

# KEEP IN PLACE: Specialized docs (do not touch)
$keepPatterns = @(
    '^\.github/',
    '^agents/',
    '^ops/',
    '^warehouse/',
    '^assistant_api/README\.md$',
    '^apps/backend/app/ml/README\.md$',
    '^apps/backend/app/routers/agent_tools/README\.md$',
    '^apps/backend/README\.md$',
    '^apps/web/README\.md$',
    '^hackathon/README\.md$',
    '^docs/archive/'  # Already archived
)

# DELETE: Obsolete/duplicate files (truly remove from repo)
$deletePatterns = @(
    '^README_OLD\.md$',
    '^GPU_QUOTA_STATUS\.md$',
    # Test-specific docs in nested test directories (keep main test READMEs)
    '^apps/web/tests/e2e/.*\.md$',
    '^apps/web/tests/\.auth/README\.md$',
    '^apps/web/tests/dev-.*\.README\.md$',
    '^apps/backend/tests/README_ml_suggest\.md$',
    '^apps/backend/tests/PYTEST_SETUP\.md$'
)

# ARCHIVE: Everything else goes to docs/archive/
function Should-Keep($file) {
    # Check exact matches
    if ($keepFiles -contains $file) { return $true }

    # Check patterns
    foreach ($pattern in $keepPatterns) {
        if ($file -match $pattern) { return $true }
    }

    return $false
}

function Should-Delete($file) {
    foreach ($pattern in $deletePatterns) {
        if ($file -match $pattern) { return $true }
    }
    return $false
}

$archived = 0
$deleted = 0
$kept = 0

Write-Host "🧹 LedgerMind Docs Cleanup" -ForegroundColor Cyan
Write-Host "Found $($allMdFiles.Count) markdown files" -ForegroundColor Gray
Write-Host ""

foreach ($file in $allMdFiles) {
    if (Should-Keep $file) {
        $kept++
        continue
    }

    if (Should-Delete $file) {
        Write-Host "🗑️  DELETE: $file" -ForegroundColor Red
        git rm $file
        $deleted++
    } else {
        # Move to archive
        $basename = Split-Path -Leaf $file
        $targetPath = "docs/archive/$basename"

        # Handle name collisions by adding numeric suffix
        $counter = 1
        while (Test-Path $targetPath) {
            $baseName = [System.IO.Path]::GetFileNameWithoutExtension($basename)
            $ext = [System.IO.Path]::GetExtension($basename)
            $targetPath = "docs/archive/${baseName}_${counter}${ext}"
            $counter++
        }

        Write-Host "📦 ARCHIVE: $file → $targetPath" -ForegroundColor Yellow
        git mv $file $targetPath
        $archived++
    }
}

Write-Host ""
Write-Host "✅ Cleanup Summary:" -ForegroundColor Green
Write-Host "   Kept:     $kept files" -ForegroundColor White
Write-Host "   Archived: $archived files" -ForegroundColor Yellow
Write-Host "   Deleted:  $deleted files" -ForegroundColor Red
Write-Host ""
Write-Host "Run 'git status' to review changes before committing." -ForegroundColor Gray
