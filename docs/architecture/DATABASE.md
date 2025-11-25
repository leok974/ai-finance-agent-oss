# Database Schema & Migrations

Database structure and migration management for LedgerMind.

---

## Schema Overview

### Core Tables

- **users** - User accounts and authentication
- **transactions** - Financial transactions (encrypted fields)
- **categories** - Transaction categories
- **rules** - Auto-categorization rules
- **suggestions** - ML-generated category suggestions
- **encryption_keys** - Envelope encryption DEKs

### Supporting Tables

- **merchant_hints** - Manual merchant → category mappings
- **analytics_events** - Usage tracking
- **help_cache** - Cached help/tooltip responses

---

## Migrations

Managed via [Alembic](https://alembic.sqlalchemy.org/).

### Commands

```bash
cd apps/backend

# Apply all migrations
alembic upgrade head

# Create new migration
alembic revision --autogenerate -m "add feature"

# Rollback
alembic downgrade -1

# View history
alembic history
```

---

## Encryption

Sensitive fields (`description`, `merchant_raw`, `note`) use envelope encryption:

- **DEK:** AES-256-GCM data encryption key
- **KEK:** KMS or env-based key encryption key
- **Storage:** Encrypted fields stored as `description_enc`, plaintext as `description_text` (hybrid accessor)

**See:** [`SECURITY.md`](SECURITY.md) for encryption details.

---

## Schema Migrations

### Current Head

Check latest migration:
```bash
alembic current
```

### Adding Columns

```python
# migrations/versions/xxx_add_column.py
def upgrade():
    op.add_column('transactions', sa.Column('new_field', sa.String()))

def downgrade():
    op.drop_column('transactions', 'new_field')
```

---

## Further Reading

- **Setup:** [`../setup/DEV_SETUP.md`](../setup/DEV_SETUP.md)
- **Operations:** [`../operations/RUNBOOKS.md`](../operations/RUNBOOKS.md)
