#!/usr/bin/env pwsh
# Apply ML Training Preservation Migration
# Run this script to preserve feedback when users click Reset

Write-Host "`n🚀 ML Training Preservation Migration" -ForegroundColor Cyan
Write-Host "======================================`n" -ForegroundColor Cyan

# Safety checks
Write-Host "⚠️  WARNING: This will modify the database schema" -ForegroundColor Yellow
Write-Host "⚠️  A backup will be created automatically`n" -ForegroundColor Yellow

$confirm = Read-Host "Continue? (yes/no)"
if ($confirm -ne "yes") {
    Write-Host "`n❌ Migration cancelled" -ForegroundColor Red
    exit 0
}

# Step 1: Backup database
Write-Host "`n📦 Step 1: Backing up database..." -ForegroundColor Cyan
$backupFile = "backup_$(Get-Date -Format 'yyyyMMdd_HHmmss').sql"
try {
    docker exec ai-finance-agent-oss-clean-postgres-1 pg_dump -U myuser finance > $backupFile
    Write-Host "   ✅ Backup created: $backupFile" -ForegroundColor Green
} catch {
    Write-Host "   ❌ Backup failed: $_" -ForegroundColor Red
    exit 1
}

# Step 2: Check current feedback count
Write-Host "`n📊 Step 2: Checking current data..." -ForegroundColor Cyan
try {
    $feedbackCount = docker exec ai-finance-agent-oss-clean-postgres-1 psql -U myuser -d finance -t -c "SELECT COUNT(*) FROM feedback;" 2>$null
    $feedbackCount = $feedbackCount.Trim()
    Write-Host "   Current feedback events: $feedbackCount" -ForegroundColor White

    $txnCount = docker exec ai-finance-agent-oss-clean-postgres-1 psql -U myuser -d finance -t -c "SELECT COUNT(*) FROM transactions;" 2>$null
    $txnCount = $txnCount.Trim()
    Write-Host "   Current transactions: $txnCount" -ForegroundColor White
} catch {
    Write-Host "   ⚠️  Could not query database (may need auth)" -ForegroundColor Yellow
}

# Step 3: Apply migration
Write-Host "`n🔧 Step 3: Applying migration..." -ForegroundColor Cyan
Push-Location apps/backend
try {
    $result = alembic upgrade head 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "   ✅ Migration applied successfully" -ForegroundColor Green
    } else {
        Write-Host "   ❌ Migration failed:" -ForegroundColor Red
        Write-Host $result -ForegroundColor Red
        Pop-Location
        exit 1
    }
} catch {
    Write-Host "   ❌ Migration failed: $_" -ForegroundColor Red
    Pop-Location
    exit 1
}
Pop-Location

# Step 4: Verify schema changes
Write-Host "`n✅ Step 4: Verifying schema changes..." -ForegroundColor Cyan

# Check for new columns
$columns = docker exec ai-finance-agent-oss-clean-postgres-1 psql -U myuser -d finance -t -c "SELECT column_name FROM information_schema.columns WHERE table_name='feedback' ORDER BY ordinal_position;" 2>$null
Write-Host "   Feedback table columns:" -ForegroundColor White
Write-Host $columns -ForegroundColor Gray

# Check FK constraint removed
$fkCount = docker exec ai-finance-agent-oss-clean-postgres-1 psql -U myuser -d finance -t -c "SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_name='feedback' AND constraint_type='FOREIGN KEY';" 2>$null
$fkCount = $fkCount.Trim()
if ($fkCount -eq "0") {
    Write-Host "   ✅ Foreign key constraint removed" -ForegroundColor Green
} else {
    Write-Host "   ⚠️  Foreign key constraint still exists (expected: 0, got: $fkCount)" -ForegroundColor Yellow
}

# Check txn_id nullable
$nullable = docker exec ai-finance-agent-oss-clean-postgres-1 psql -U myuser -d finance -t -c "SELECT is_nullable FROM information_schema.columns WHERE table_name='feedback' AND column_name='txn_id';" 2>$null
$nullable = $nullable.Trim()
if ($nullable -eq "YES") {
    Write-Host "   ✅ txn_id is now nullable" -ForegroundColor Green
} else {
    Write-Host "   ⚠️  txn_id nullability: $nullable" -ForegroundColor Yellow
}

# Step 5: Test functionality
Write-Host "`n🧪 Step 5: Testing..." -ForegroundColor Cyan
Write-Host "   Creating test feedback event..." -ForegroundColor White
try {
    docker exec ai-finance-agent-oss-clean-postgres-1 psql -U myuser -d finance -c "INSERT INTO feedback (merchant, label, decision, weight) VALUES ('TestMerchant', 'TestCategory', 'accept', 1.0);" 2>$null | Out-Null
    Write-Host "   ✅ Test feedback created" -ForegroundColor Green

    # Get count
    $newCount = docker exec ai-finance-agent-oss-clean-postgres-1 psql -U myuser -d finance -t -c "SELECT COUNT(*) FROM feedback;" 2>$null
    $newCount = $newCount.Trim()
    Write-Host "   Current feedback count: $newCount" -ForegroundColor White

    # Clean up test data
    docker exec ai-finance-agent-oss-clean-postgres-1 psql -U myuser -d finance -c "DELETE FROM feedback WHERE merchant='TestMerchant';" 2>$null | Out-Null
    Write-Host "   ✅ Test data cleaned up" -ForegroundColor Green
} catch {
    Write-Host "   ⚠️  Test skipped: $_" -ForegroundColor Yellow
}

# Summary
Write-Host "`n" + "="*60 -ForegroundColor Cyan
Write-Host "✨ MIGRATION COMPLETE!" -ForegroundColor Green
Write-Host "="*60 -ForegroundColor Cyan

Write-Host "`n📋 What Changed:" -ForegroundColor Cyan
Write-Host "  • feedback.txn_id is now nullable (no CASCADE DELETE)" -ForegroundColor White
Write-Host "  • Added columns: merchant, model_pred, decision, weight, month" -ForegroundColor White
Write-Host "  • Feedback now survives transaction deletion" -ForegroundColor White
Write-Host "  • ML training data preserved across Resets" -ForegroundColor White

Write-Host "`n🎯 Next Steps:" -ForegroundColor Cyan
Write-Host "  1. Test Reset button in browser" -ForegroundColor White
Write-Host "  2. Upload CSV → Accept suggestion → Click Reset" -ForegroundColor White
Write-Host "  3. Verify feedback persists:" -ForegroundColor White
Write-Host "     SELECT COUNT(*) FROM feedback;" -ForegroundColor Gray
Write-Host "  4. Re-upload CSV and verify auto-categorization works" -ForegroundColor White

Write-Host "`n📦 Backup Location:" -ForegroundColor Cyan
Write-Host "  $backupFile" -ForegroundColor White

Write-Host "`n🔄 Rollback (if needed):" -ForegroundColor Cyan
Write-Host "  alembic downgrade -1" -ForegroundColor White

Write-Host "`n✅ Migration successful!`n" -ForegroundColor Green
