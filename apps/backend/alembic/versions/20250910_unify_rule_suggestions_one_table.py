"""Unify rule suggestions into one table (extend persisted + migrate mined)

Revision ID: 20250910_unify_rule_suggestions_one_table
Revises: 20250910_rule_suggestions_persisted
Create Date: 2025-09-10
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect
from sqlalchemy.sql import text

# ids
revision = "20250910_unify_rule_suggestions_one_table"
down_revision = "20250910_extend_rule_suggestions_persisted"
branch_labels = None
depends_on = None

def upgrade():
    conn = op.get_bind()
    insp = inspect(conn)

    # ---- 1) Add columns ONLY if missing (idempotent) ----
    cols = {c["name"] for c in insp.get_columns("rule_suggestions_persisted", schema="public")}

    if "source" not in cols:
        # Postgres supports IF NOT EXISTS, but we'll stay portable via inspector
        op.add_column(
            "rule_suggestions_persisted",
            sa.Column("source", sa.String(16), nullable=False, server_default="persisted"),
        )
    if "metrics_json" not in cols:
        op.add_column(
            "rule_suggestions_persisted",
            sa.Column("metrics_json", sa.JSON, nullable=True),
        )
    if "last_mined_at" not in cols:
        op.add_column(
            "rule_suggestions_persisted",
            sa.Column("last_mined_at", sa.DateTime(timezone=True), nullable=True),
        )

    # ---- 2) Copy legacy rows if the old mined table exists (Postgres-safe) ----
    legacy_exists = conn.execute(text("SELECT to_regclass('public.rule_suggestions')")).scalar() is not None
    if legacy_exists:
        rows = conn.execute(text("""
            SELECT merchant, category, count, window_days,
                   COALESCE(updated_at, NOW()) AS updated_at
            FROM public.rule_suggestions
        """)).fetchall()

        for merchant, category, count, window_days, updated_at in rows:
            conn.execute(text("""
                INSERT INTO rule_suggestions_persisted
                    (merchant, category, status, count, window_days, source,
                     metrics_json, created_at, updated_at, last_mined_at)
                VALUES
                    (:merchant, :category, 'new', :count, :window_days, 'mined',
                     NULL, NOW(), :updated_at, :updated_at)
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
                "merchant": merchant,
                "category": category,
                "count": int(count) if count is not None else None,
                "window_days": int(window_days) if window_days is not None else None,
                "updated_at": updated_at,
            })

    # (Optional) don’t drop legacy table automatically; do it later when confident

def downgrade():
    # best-effort rollback of the extra columns (safe even if previously missing)
    with op.batch_alter_table("rule_suggestions_persisted") as batch:
        try:
            batch.drop_column("last_mined_at")
        except Exception:
            pass
        try:
            batch.drop_column("metrics_json")
        except Exception:
            pass
        try:
            batch.drop_column("source")
        except Exception:
            pass
