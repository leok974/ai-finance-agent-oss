-- ============================================================================
-- Pre-flight validation for ml_features.tokens migration (text[] → jsonb)
-- ============================================================================
-- Run these queries BEFORE applying migration 502d44cd70ab
-- Database: PostgreSQL production instance

-- 0.1) Check current column type (should be ARRAY or "text[]")
SELECT
    column_name,
    data_type,
    udt_name,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'ml_features'
  AND column_name = 'tokens';

-- Expected result (before migration):
-- column_name | data_type | udt_name | is_nullable
-- tokens      | ARRAY     | _text    | YES


-- 0.2) Row count and null/empty statistics
SELECT
    COUNT(*) AS total_rows,
    COUNT(*) FILTER (WHERE tokens IS NULL) AS null_tokens,
    COUNT(*) FILTER (WHERE tokens = '{}') AS empty_array_tokens,
    COUNT(*) FILTER (WHERE tokens IS NOT NULL AND tokens <> '{}') AS populated_tokens
FROM ml_features;

-- Expected: Shows distribution of NULL vs empty vs populated arrays


-- 0.3) Sample data (first 5 rows with non-null tokens)
SELECT
    txn_id,
    tokens,
    array_length(tokens, 1) AS token_count
FROM ml_features
WHERE tokens IS NOT NULL
LIMIT 5;

-- Expected: Shows actual token arrays like {"word1","word2"}


-- ============================================================================
-- Post-migration validation
-- ============================================================================
-- Run these queries AFTER applying migration 502d44cd70ab

-- 1.1) Verify column type changed to jsonb
SELECT
    column_name,
    data_type,
    udt_name,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'ml_features'
  AND column_name = 'tokens';

-- Expected result (after migration):
-- column_name | data_type | udt_name | is_nullable
-- tokens      | jsonb     | jsonb    | YES


-- 1.2) Verify all non-null values are JSON arrays
SELECT
    COUNT(*) AS non_array_count
FROM ml_features
WHERE tokens IS NOT NULL
  AND jsonb_typeof(tokens) <> 'array';

-- Expected: 0 (all non-null tokens should be arrays)


-- 1.3) Verify data integrity (sample comparison)
SELECT
    txn_id,
    tokens,
    jsonb_array_length(tokens) AS token_count,
    jsonb_typeof(tokens) AS json_type
FROM ml_features
WHERE tokens IS NOT NULL
LIMIT 5;

-- Expected: Shows JSON arrays like ["word1","word2"]


-- 1.4) Verify GIN index was created
SELECT
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename = 'ml_features'
  AND indexname = 'ix_ml_features_tokens_gin';

-- Expected result:
-- indexname                    | indexdef
-- ix_ml_features_tokens_gin    | CREATE INDEX ... USING gin (tokens jsonb_ops)


-- 1.5) Test index is usable (explain plan should show Index Scan)
EXPLAIN (ANALYZE, BUFFERS)
SELECT txn_id, tokens
FROM ml_features
WHERE tokens @> '["merchant"]'::jsonb
LIMIT 10;

-- Expected: "Index Scan using ix_ml_features_tokens_gin" in query plan


-- ============================================================================
-- Rollback validation (if needed)
-- ============================================================================
-- Run after: alembic downgrade -1

-- 2.1) Verify column type reverted to text[]
SELECT
    column_name,
    data_type,
    udt_name
FROM information_schema.columns
WHERE table_name = 'ml_features'
  AND column_name = 'tokens';

-- Expected: data_type = 'ARRAY', udt_name = '_text'


-- 2.2) Verify index was dropped
SELECT COUNT(*) AS index_exists
FROM pg_indexes
WHERE tablename = 'ml_features'
  AND indexname = 'ix_ml_features_tokens_gin';

-- Expected: 0 (index should be gone)


-- ============================================================================
-- Performance testing (optional)
-- ============================================================================

-- Test containment query performance (jsonb)
EXPLAIN (ANALYZE, BUFFERS)
SELECT COUNT(*)
FROM ml_features
WHERE tokens ? 'specific_token';

-- Test array element access (should use GIN index)
EXPLAIN (ANALYZE, BUFFERS)
SELECT txn_id
FROM ml_features
WHERE tokens @> '["coffee"]'::jsonb;
