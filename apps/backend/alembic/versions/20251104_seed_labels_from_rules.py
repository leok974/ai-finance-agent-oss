"""Seed labels from rule heuristics (Groceries/Dining/Shopping/Transport/Subs/Entertainment)

Revision ID: 20251104_seed_labels_from_rules
Revises: 84517dc3bc96
Create Date: 2025-11-04

This migration inserts golden labels into transaction_labels using simple
merchant/description-based heuristics to bootstrap ML training. Safe to rerun due
to ON CONFLICT DO NOTHING. Rows are tagged with source='seed_rules_20251104'.
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "20251104_seed_labels_from_rules"
down_revision = "84517dc3bc96"
branch_labels = None
depends_on = None

SEED_SOURCE = "seed_rules_20251104"

def upgrade():
    conn = op.get_bind()

    # Ensure table exists (id → INTEGER FK to transactions.id)
    conn.execute(sa.text("""
    CREATE TABLE IF NOT EXISTS transaction_labels (
      txn_id     INTEGER PRIMARY KEY REFERENCES transactions(id) ON DELETE CASCADE,
      label      TEXT NOT NULL,
      source     TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
    """))

    # Insert by buckets, randomized & capped to avoid overfitting one class.
    # Adjust LIMITs as you like (total ~ 400–600 seeds).
    insert_sql = [
        # Groceries
        """
        INSERT INTO transaction_labels (txn_id, label, source)
        SELECT t.id, 'Groceries', :src
        FROM transactions t
        WHERE t.deleted_at IS NULL
          AND (
                t.description ILIKE '%HARRIS TEETER%'
             OR t.description ~* '(WHOLE\\s*FOODS|SAFEWAY|TRADER\\s*JOE''?S)'
          )
          AND NOT EXISTS (SELECT 1 FROM transaction_labels l WHERE l.txn_id=t.id)
        ORDER BY random() LIMIT 120
        ON CONFLICT (txn_id) DO NOTHING;
        """,

        # Dining / Delivery
        """
        INSERT INTO transaction_labels (txn_id, label, source)
        SELECT t.id, 'Dining', :src
        FROM transactions t
        WHERE t.deleted_at IS NULL
          AND (
                t.description ILIKE '%DOORDASH%'
             OR t.description ~* '(UBER\\s*EATS|GRUBHUB|PAISANO''?S|NED\\s*DEVINE)'
             OR t.merchant   ~* '(NED\\s*DEVINE|PAISANO)'
          )
          AND NOT EXISTS (SELECT 1 FROM transaction_labels l WHERE l.txn_id=t.id)
        ORDER BY random() LIMIT 120
        ON CONFLICT (txn_id) DO NOTHING;
        """,

        # Shopping (Amazon)
        """
        INSERT INTO transaction_labels (txn_id, label, source)
        SELECT t.id, 'Shopping', :src
        FROM transactions t
        WHERE t.deleted_at IS NULL
          AND (t.description ILIKE '%AMAZON%')
          AND NOT EXISTS (SELECT 1 FROM transaction_labels l WHERE l.txn_id=t.id)
        ORDER BY random() LIMIT 120
        ON CONFLICT (txn_id) DO NOTHING;
        """,

        # Transportation (Uber/Lyft/Metro)
        """
        INSERT INTO transaction_labels (txn_id, label, source)
        SELECT t.id, 'Transportation', :src
        FROM transactions t
        WHERE t.deleted_at IS NULL
          AND (
                t.description ~* '(UBER|LYFT)'
             OR t.description ILIKE '%WMATA%'
          )
          AND NOT EXISTS (SELECT 1 FROM transaction_labels l WHERE l.txn_id=t.id)
        ORDER BY random() LIMIT 80
        ON CONFLICT (txn_id) DO NOTHING;
        """,

        # Subscriptions (Netflix/Spotify/Apple/Google)
        """
        INSERT INTO transaction_labels (txn_id, label, source)
        SELECT t.id, 'Subscriptions', :src
        FROM transactions t
        WHERE t.deleted_at IS NULL
          AND t.description ~* '(NETFLIX|SPOTIFY|APPLE\\s*MUSIC|GOOGLE\\s*ONE|MICROSOFT\\s*365|ADOBE)'
          AND NOT EXISTS (SELECT 1 FROM transaction_labels l WHERE l.txn_id=t.id)
        ORDER BY random() LIMIT 60
        ON CONFLICT (txn_id) DO NOTHING;
        """,

        # Entertainment (Cinemas/Streaming not covered above)
        """
        INSERT INTO transaction_labels (txn_id, label, source)
        SELECT t.id, 'Entertainment', :src
        FROM transactions t
        WHERE t.deleted_at IS NULL
          AND (
               t.description ~* '(AMC|REGAL|FANDANGO)'
            OR t.description ~* '(HULU|DISNEY\\+|PARAMOUNT\\+)' 
          )
          AND NOT EXISTS (SELECT 1 FROM transaction_labels l WHERE l.txn_id=t.id)
        ORDER BY random() LIMIT 60
        ON CONFLICT (txn_id) DO NOTHING;
        """
    ]

    for sql in insert_sql:
        conn.execute(sa.text(sql), {"src": SEED_SOURCE})

def downgrade():
    conn = op.get_bind()
    # Remove only rows that this seed inserted
    conn.execute(sa.text("""
        DELETE FROM transaction_labels WHERE source = :src
    """), {"src": SEED_SOURCE})
