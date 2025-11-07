# Run merchant label backfill and verify coverage improvement
Write-Host "=== Merchant Label Backfill ===" -ForegroundColor Cyan
Write-Host ""

# Check coverage BEFORE
Write-Host "Label coverage BEFORE backfill:" -ForegroundColor Yellow
& psql $env:DATABASE_URL -c "
with c as (
  select lower(t.merchant) m, count(*) n
  from user_labels ul join transactions t on t.id=ul.txn_id
  group by 1
)
select m, n from c order by n desc limit 20;
"
Write-Host ""

# Run backfill
Write-Host "Running backfill script..." -ForegroundColor Yellow
& psql $env:DATABASE_URL -f apps/backend/scripts/backfill_merchant_labels.sql
Write-Host ""

# Check coverage AFTER
Write-Host "Label coverage AFTER backfill:" -ForegroundColor Yellow
& psql $env:DATABASE_URL -c "
with c as (
  select lower(t.merchant) m, count(*) n
  from user_labels ul join transactions t on t.id=ul.txn_id
  group by 1
)
select m, n from c order by n desc limit 20;
"
Write-Host ""

Write-Host "=== Backfill Complete ===" -ForegroundColor Green
