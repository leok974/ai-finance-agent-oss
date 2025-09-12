from logging.config import fileConfig
from alembic import context
from sqlalchemy import engine_from_config, pool, text
import os, sys

# Ensure the 'app' package is importable when running Alembic from this folder
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from app.db import Base
import app.models  # noqa: F401  # register ORM tables via unified surface

# NEW: pull the URL from your app settings/environment
try:
    from app.config import settings
    db_url = getattr(settings, "DATABASE_URL", "") or os.getenv("DATABASE_URL", "")
except Exception:
    db_url = os.getenv("DATABASE_URL", "")

# fallback for local dev: file SQLite next to backend folder
if not db_url:
    db_url = "sqlite:///./data/app.db"

# IMPORTANT: tell Alembic the URL to use
config = context.config
config.set_main_option("sqlalchemy.url", db_url)
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata

def run_migrations_offline():
    context.configure(
        url=config.get_main_option("sqlalchemy.url"),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()

def _ensure_alembic_version_width(connection):
    """Ensure alembic_version.version_num can store long revision ids.

    Some historical databases may have a 32-char column. Our revision ids
    can be longer (e.g., with human-friendly slugs), so widen to VARCHAR(64).
    """
    try:
        if connection.dialect.name.startswith("postgres"):
            # Create table if missing with the correct width
            with connection.begin():
                connection.execute(
                    text(
                        "CREATE TABLE IF NOT EXISTS public.alembic_version (version_num VARCHAR(64) PRIMARY KEY)"
                    )
                )
            # Try to widen existing column; ignore if already wide enough
            try:
                with connection.begin():
                    connection.execute(
                        text(
                            "ALTER TABLE public.alembic_version ALTER COLUMN version_num TYPE VARCHAR(64)"
                        )
                    )
            except Exception:
                # Likely already correct width; proceed
                pass
    except Exception:
        # Never block migrations if this helper fails; proceed as-is
        pass


def run_migrations_online():
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        is_sqlite = connection.dialect.name == "sqlite"
        # Preflight: ensure alembic_version can hold long revision ids (Postgres)
        _ensure_alembic_version_width(connection)
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            render_as_batch=is_sqlite,
            compare_type=True,
            compare_server_default=True,
        )
        with context.begin_transaction():
            context.run_migrations()

if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
