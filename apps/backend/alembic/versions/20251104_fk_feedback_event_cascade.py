"""Add ON DELETE SET NULL to suggestion_feedback.event_id FK

This migration fixes the foreign key constraint violation when deleting transactions
with replace=true in /ingest. The cascade chain is:
  transactions → suggestion_events (ON DELETE CASCADE)
  suggestion_events → suggestion_feedback (ON DELETE SET NULL) ← THIS MIGRATION

Strategy: ON DELETE SET NULL preserves feedback history for analytics/post-mortems
while breaking the constraint cycle that was causing 500 errors.

Revision ID: 20251104_fk_feedback_event_cascade
Revises: 20251104_fix_created_at
Create Date: 2025-11-04 20:30:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "20251104_fk_feedback_event_cascade"
down_revision = "20251104_fix_created_at"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """
    Update suggestion_feedback.event_id FK to use ON DELETE SET NULL.
    When a suggestion_event is deleted (e.g., via transaction cascade),
    the feedback row remains with event_id = NULL for historical analysis.
    """
    op.execute("""
        ALTER TABLE suggestion_feedback
          DROP CONSTRAINT IF EXISTS suggestion_feedback_event_id_fkey;
        
        ALTER TABLE suggestion_feedback
          ADD CONSTRAINT suggestion_feedback_event_id_fkey
          FOREIGN KEY (event_id)
          REFERENCES suggestion_events(id)
          ON DELETE SET NULL;
    """)


def downgrade() -> None:
    """
    Revert to original FK without cascade action.
    WARNING: This will restore the bug that causes 500 errors on ingest replace=true.
    """
    op.execute("""
        ALTER TABLE suggestion_feedback
          DROP CONSTRAINT IF EXISTS suggestion_feedback_event_id_fkey;
        
        ALTER TABLE suggestion_feedback
          ADD CONSTRAINT suggestion_feedback_event_id_fkey
          FOREIGN KEY (event_id)
          REFERENCES suggestion_events(id);
    """)
