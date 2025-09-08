"""add feedback table

Revision ID: 20250908_add_feedback
Revises: 5f780aef3f22
Create Date: 2025-09-08 17:05:00.000000
"""
from alembic import op
import sqlalchemy as sa

# Revision identifiers, used by Alembic.
revision = "20250908_add_feedback"
down_revision = "5f780aef3f22"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "feedback",
        sa.Column("id", sa.Integer, primary_key=True, nullable=False),
        sa.Column("txn_id", sa.Integer, nullable=False),
        sa.Column("label", sa.String(), nullable=False),
        sa.Column("source", sa.String(), nullable=False, server_default="user_change"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("notes", sa.Text(), nullable=True),
        # If you want a hard FK to transactions, uncomment the next line
        # sa.ForeignKeyConstraint(["txn_id"], ["transactions.id"], name="fk_feedback_txn"),
    )
    op.create_index("ix_feedback_txn_id", "feedback", ["txn_id"])


def downgrade():
    op.drop_index("ix_feedback_txn_id", table_name="feedback")
    op.drop_table("feedback")
