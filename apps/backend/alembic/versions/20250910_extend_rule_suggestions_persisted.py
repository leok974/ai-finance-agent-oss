"""extend rule_suggestions_persisted with origin+metrics

Revision ID: 20250910_extend_rule_suggestions_persisted
Revises: 20250910_rule_suggestions_persisted
Create Date: 2025-09-10
"""

from alembic import op
import sqlalchemy as sa


revision = "20250910_extend_rule_suggestions_persisted"
down_revision = "20250910_rule_suggestions_persisted"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("rule_suggestions_persisted", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column(
                "source",
                sa.String(length=16),
                nullable=False,
                server_default="persisted",
            )
        )
        batch_op.add_column(sa.Column("metrics_json", sa.JSON, nullable=True))
        batch_op.add_column(
            sa.Column("last_mined_at", sa.DateTime(timezone=True), nullable=True)
        )


def downgrade():
    with op.batch_alter_table("rule_suggestions_persisted", schema=None) as batch_op:
        batch_op.drop_column("last_mined_at")
        batch_op.drop_column("metrics_json")
        batch_op.drop_column("source")
