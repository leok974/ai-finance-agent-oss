"""Add foreign key constraint to suggestion_events.txn_id

Revision ID: 20251103_suggestions_fk
Revises: 20251103_suggestions
Create Date: 2025-11-03 14:00:00.000000

"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "20251103_suggestions_fk"
down_revision = "20251103_suggestions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add foreign key constraint from suggestion_events.txn_id to transactions.id
    with op.batch_alter_table("suggestion_events") as batch_op:
        batch_op.create_foreign_key(
            "fk_suggestion_events_txn",
            referent_table="transactions",
            local_cols=["txn_id"],
            remote_cols=["id"],
            ondelete="CASCADE",
        )
    
    # Ensure index exists (safe if already created)
    op.create_index(
        "ix_suggestion_events_txn_id",
        "suggestion_events",
        ["txn_id"],
        if_not_exists=True,
    )


def downgrade() -> None:
    op.drop_index("ix_suggestion_events_txn_id", table_name="suggestion_events")
    with op.batch_alter_table("suggestion_events") as batch_op:
        batch_op.drop_constraint("fk_suggestion_events_txn", type_="foreignkey")
