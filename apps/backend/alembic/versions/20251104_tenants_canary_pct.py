"""Add tenants table with canary percentage

Revision ID: 20251104_tenants_canary_pct
Revises: 20251104_model_registry
Create Date: 2025-11-04

"""
from alembic import op
import sqlalchemy as sa
from datetime import datetime

# revision identifiers, used by Alembic.
revision = "20251104_tenants_canary_pct"
down_revision = "20251104_model_registry"
branch_labels = None
depends_on = None


def upgrade():
    # Create tenants table
    op.create_table(
        "tenants",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("name", sa.String, nullable=False),
        sa.Column("created_at", sa.DateTime, nullable=False, default=datetime.utcnow),
        sa.Column("suggest_canary_pct", sa.Integer, nullable=True),
    )
    
    # Add tenant_id to transactions (nullable for now)
    op.add_column("transactions", sa.Column("tenant_id", sa.Integer, nullable=True))
    op.create_index("ix_transactions_tenant_id", "transactions", ["tenant_id"])


def downgrade():
    op.drop_index("ix_transactions_tenant_id", "transactions")
    op.drop_column("transactions", "tenant_id")
    op.drop_table("tenants")
