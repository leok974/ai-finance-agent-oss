"""Persisted rule suggestions (separate table) + ignores + audit

Revision ID: 20250910_rule_suggestions_persisted
Revises: 20250910_rule_suggestions
Create Date: 2025-09-10
"""

from alembic import op
import sqlalchemy as sa


revision = "20250910_rule_suggestions_persisted"
down_revision = "20250910_rule_suggestions"
branch_labels = None
depends_on = None


def upgrade():
    # anomaly_ignores
    op.create_table(
        "anomaly_ignores",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("category", sa.String(255), nullable=False, unique=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_anomaly_ignores_category", "anomaly_ignores", ["category"], unique=True
    )

    # rule_suggestion_ignores
    op.create_table(
        "rule_suggestion_ignores",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("merchant", sa.String(255), nullable=False),
        sa.Column("category", sa.String(255), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index(
        "ux_rule_suggestion_ignores_merchant_category",
        "rule_suggestion_ignores",
        ["merchant", "category"],
        unique=True,
    )

    # persisted suggestions (NEW NAME)
    op.create_table(
        "rule_suggestions_persisted",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("merchant", sa.String(255), nullable=False),
        sa.Column("category", sa.String(255), nullable=False),
        sa.Column(
            "status", sa.String(16), nullable=False, server_default="new"
        ),  # new|accepted|dismissed
        sa.Column("count", sa.Integer, nullable=True),
        sa.Column("window_days", sa.Integer, nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    # Implement onupdate for updated_at in a cross-dialect way via triggers if needed later; for now app-side updates it
    op.create_index(
        "ix_rule_suggestions_persisted_status", "rule_suggestions_persisted", ["status"]
    )
    op.create_index(
        "ux_rule_suggestions_persisted_merchant_category",
        "rule_suggestions_persisted",
        ["merchant", "category"],
        unique=True,
    )

    # (optional) audit table
    op.create_table(
        "rule_backfill_runs",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("rule_id", sa.Integer, nullable=True),
        sa.Column("filters_json", sa.JSON, nullable=False),
        sa.Column("matched", sa.Integer, nullable=False, server_default="0"),
        sa.Column("updated", sa.Integer, nullable=False, server_default="0"),
        sa.Column(
            "dry_run", sa.Boolean, nullable=False, server_default=sa.text("false")
        ),
        sa.Column("actor", sa.String(255), nullable=True),
        sa.Column(
            "started_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade():
    op.drop_table("rule_backfill_runs")
    op.drop_index(
        "ux_rule_suggestions_persisted_merchant_category",
        table_name="rule_suggestions_persisted",
    )
    op.drop_index(
        "ix_rule_suggestions_persisted_status", table_name="rule_suggestions_persisted"
    )
    op.drop_table("rule_suggestions_persisted")
    op.drop_index(
        "ux_rule_suggestion_ignores_merchant_category",
        table_name="rule_suggestion_ignores",
    )
    op.drop_table("rule_suggestion_ignores")
    op.drop_index("ix_anomaly_ignores_category", table_name="anomaly_ignores")
    op.drop_table("anomaly_ignores")
