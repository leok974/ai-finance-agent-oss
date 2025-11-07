#!/bin/bash
# Run merchant label backfill and verify coverage improvement
set -e

echo "=== Merchant Label Backfill ==="
echo ""

# Check coverage BEFORE
echo "Label coverage BEFORE backfill:"
psql "$DATABASE_URL" -c "
with c as (
  select lower(t.merchant) m, count(*) n
  from user_labels ul join transactions t on t.id=ul.txn_id
  group by 1
)
select m, n from c order by n desc limit 20;
"
echo ""

# Run backfill
echo "Running backfill script..."
psql "$DATABASE_URL" -f apps/backend/scripts/backfill_merchant_labels.sql
echo ""

# Check coverage AFTER
echo "Label coverage AFTER backfill:"
psql "$DATABASE_URL" -c "
with c as (
  select lower(t.merchant) m, count(*) n
  from user_labels ul join transactions t on t.id=ul.txn_id
  group by 1
)
select m, n from c order by n desc limit 20;
"
echo ""

echo "=== Backfill Complete ==="
