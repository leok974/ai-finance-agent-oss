"""init tables

Revision ID: 20250903_0001
Revises:
Create Date: 2025-09-03
"""

# revision identifiers, used by Alembic.
revision = "20250903_0001"
down_revision = None
branch_labels = None
depends_on = None

# NOTE: Temporary no-op for duplicate init migration
# This repo has two historical init migrations. The other init (7d9707fac06d)
# is the authoritative baseline. We keep this revision in history but skip it
# to avoid duplicate table creation when rebuilding dev databases.


def upgrade():
    # TEMP NO-OP:
    # This repo has two historical init migrations. The other init (7d9707fac06d)
    # is the authoritative baseline. We keep this revision in history but skip it
    # to avoid duplicate table creation when rebuilding dev databases.
    pass


def downgrade():
    # TEMP NO-OP
    pass
