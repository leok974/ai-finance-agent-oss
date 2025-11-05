"""Model registry migration

Revision ID: 20251104_model_registry
Revises: 20251103_suggestions_idx_created_at
Create Date: 2025-11-04

"""
from alembic import op
import sqlalchemy as sa
from datetime import datetime

# revision identifiers, used by Alembic.
revision = "20251104_model_registry"
down_revision = "20251103_suggestions_idx_created_at"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "model_registry",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("model_id", sa.String, nullable=False, unique=True, index=True),
        sa.Column("created_at", sa.DateTime, nullable=False, default=datetime.utcnow),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("commit_sha", sa.String, nullable=True),
        sa.Column("artifact_uri", sa.String, nullable=True),
        sa.Column("phase", sa.String, nullable=True),  # e.g. 'shadow','canary10','live'
    )


def downgrade():
    op.drop_table("model_registry")
