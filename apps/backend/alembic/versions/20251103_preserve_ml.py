"""preserve ml training data on transaction delete

Revision ID: 20251103_preserve_ml
Revises: HEAD
Create Date: 2025-11-03 19:00:00.000000

Decouple ML training data (feedback, rules) from transaction lifecycle.
When transactions are deleted (e.g., via Reset), the learned signals must persist.
"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "20251103_preserve_ml"
down_revision: Union[str, None] = "20251005_mch_unique_idx"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """
    Make feedback.txn_id nullable and remove FK constraint.

    Rationale: Feedback is a *training event*, not a fact dependent on transaction existence.
    When users delete transactions, we want to preserve the learning signal.
    """

    # Drop the foreign key constraint if it exists
    # Note: Constraint name may vary; check your database
    try:
        op.drop_constraint("feedback_txn_id_fkey", "feedback", type_="foreignkey")
    except Exception:
        # Constraint might not exist or have different name
        pass

    # Make txn_id nullable (it becomes a weak reference)
    op.alter_column("feedback", "txn_id", existing_type=sa.Integer(), nullable=True)

    # Add merchant field for direct training (so we don't need the txn)
    op.add_column("feedback", sa.Column("merchant", sa.String(256), nullable=True))

    # Add model prediction field for tracking accuracy
    op.add_column("feedback", sa.Column("model_pred", sa.String(128), nullable=True))

    # Add decision type (accept/correct/reject)
    op.add_column(
        "feedback",
        sa.Column("decision", sa.String(32), nullable=True, server_default="correct"),
    )

    # Add weight for importance sampling
    op.add_column(
        "feedback",
        sa.Column("weight", sa.Float(), nullable=False, server_default="1.0"),
    )

    # Add month for time-based analytics
    op.add_column("feedback", sa.Column("month", sa.String(7), nullable=True))

    # Backfill merchant from transactions for existing feedback (optional migration)
    op.execute(
        """
        UPDATE feedback f
        SET merchant = t.merchant,
            month = t.month
        FROM transactions t
        WHERE f.txn_id = t.id
        AND f.merchant IS NULL
    """
    )

    # Create index on merchant for fast lookups
    op.create_index("ix_feedback_merchant", "feedback", ["merchant"])

    # Create index on label for aggregations
    op.create_index("ix_feedback_label", "feedback", ["label"])


def downgrade() -> None:
    """
    Restore original feedback schema (not recommended in production).
    """
    op.drop_index("ix_feedback_label", "feedback")
    op.drop_index("ix_feedback_merchant", "feedback")
    op.drop_column("feedback", "month")
    op.drop_column("feedback", "weight")
    op.drop_column("feedback", "decision")
    op.drop_column("feedback", "model_pred")
    op.drop_column("feedback", "merchant")

    op.alter_column("feedback", "txn_id", existing_type=sa.Integer(), nullable=False)

    # Recreate FK constraint
    op.create_foreign_key(
        "feedback_txn_id_fkey", "feedback", "transactions", ["txn_id"], ["id"]
    )
