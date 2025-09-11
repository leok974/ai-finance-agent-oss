"""Unify rule suggestions into one table (extend persisted + migrate mined)

Revision ID: 20250910_unify_rule_suggestions_one_table
Revises: 20250910_rule_suggestions_persisted
Create Date: 2025-09-10
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.sql import text

# ids
revision = "20250910_unify_rule_suggestions_one_table"
down_revision = "20250910_extend_rule_suggestions_persisted"
branch_labels = None
depends_on = None

def upgrade():
    # Columns are added in 20250910_extend_rule_suggestions_persisted. This migration focuses on data migration.

    # 1) Migrate rows from legacy mined table if present (best-effort)
    conn = op.get_bind()
    # Determine if legacy table exists (SQLite compatible)
    exists = conn.execute(text(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='rule_suggestions'"
    )).fetchone()
    if exists:
        # Introspect columns
        cols = [row[1] for row in conn.execute(text("PRAGMA table_info('rule_suggestions')")).fetchall()]
        merchant_col = 'merchant' if 'merchant' in cols else ('merchant_norm' if 'merchant_norm' in cols else None)
        category_col = 'category' if 'category' in cols else None
        count_col = 'count' if 'count' in cols else ('support_count' if 'support_count' in cols else None)
        window_col = 'window_days' if 'window_days' in cols else None
        updated_col = 'updated_at' if 'updated_at' in cols else ('last_seen' if 'last_seen' in cols else None)

        if merchant_col and category_col:
            # Build SELECT dynamically with fallbacks to NULL/CURRENT_TIMESTAMP
            select_sql = f"""
                SELECT
                    {merchant_col} AS merchant,
                    {category_col} AS category,
                    {count_col} AS count,
                    {window_col} AS window_days,
                    COALESCE({updated_col}, CURRENT_TIMESTAMP) AS updated_at
                FROM rule_suggestions
            """
            # Replace None columns with NULL literals
            select_sql = select_sql.replace("None AS count", "NULL AS count").replace("None AS window_days", "NULL AS window_days").replace("COALESCE(None, CURRENT_TIMESTAMP)", "CURRENT_TIMESTAMP")

            rows = conn.execute(text(select_sql)).fetchall()

            for r in rows:
                conn.execute(text("""
                    INSERT INTO rule_suggestions_persisted
                        (merchant, category, status, count, window_days, source, metrics_json, created_at, updated_at, last_mined_at)
                    VALUES
                        (:merchant, :category, 'new', :count, :window_days, 'mined',
                         :metrics_json, CURRENT_TIMESTAMP, :updated_at, :updated_at)
                    ON CONFLICT (merchant, category)
                    DO UPDATE SET
                        count = EXCLUDED.count,
                        window_days = EXCLUDED.window_days,
                        source = CASE
                            WHEN rule_suggestions_persisted.source = 'persisted' THEN 'persisted'
                            ELSE 'mined'
                        END,
                        metrics_json = EXCLUDED.metrics_json,
                        updated_at = EXCLUDED.updated_at,
                        last_mined_at = EXCLUDED.last_mined_at
                """), {
                    "merchant": r[0],
                    "category": r[1],
                    "count": int(r[2]) if r[2] is not None else None,
                    "window_days": int(r[3]) if r[3] is not None else None,
                    "metrics_json": None,
                    "updated_at": r[4],
                })

    # 2) Backfill source for existing persisted rows (set to 'persisted')
    conn.execute(text("""
        UPDATE rule_suggestions_persisted
        SET source = COALESCE(source, 'persisted')
        WHERE source IS NULL
    """))

def downgrade():
    # No-op: schema changes handled by 20250910_extend_rule_suggestions_persisted.
    # We do not recreate the legacy mined table here.
    pass
