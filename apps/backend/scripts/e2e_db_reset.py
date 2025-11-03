"""E2E database reset script - drops all tables (preserving alembic_version) or truncates data only."""

import os
import sys
from sqlalchemy import create_engine, text

url = os.getenv("DATABASE_URL")
if not url:
    print("DATABASE_URL not set", file=sys.stderr)
    sys.exit(1)

engine = create_engine(url, future=True)

# Use --drop-tables flag to drop all tables (for clean migration), otherwise just truncate data
drop_tables = "--drop-tables" in sys.argv

if drop_tables:
    DROP_ALL = """
    DO $$ DECLARE r RECORD; BEGIN
      FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname='public') LOOP
        EXECUTE 'DROP TABLE IF EXISTS '||quote_ident(r.tablename)||' CASCADE';
      END LOOP;
    END $$;
    """
    with engine.begin() as conn:
        conn.execute(text(DROP_ALL))
    print("DB reset OK (all tables dropped)")
else:
    # Truncate all tables EXCEPT alembic_version to preserve migration state
    TRUNCATE_ALL = """
    DO $$ DECLARE r RECORD; BEGIN
      FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename != 'alembic_version') LOOP
        EXECUTE 'TRUNCATE TABLE '||quote_ident(r.tablename)||' RESTART IDENTITY CASCADE';
      END LOOP;
    END $$;
    """
    with engine.begin() as conn:
        conn.execute(text(TRUNCATE_ALL))
    print("DB reset OK (data truncated, alembic_version preserved)")
