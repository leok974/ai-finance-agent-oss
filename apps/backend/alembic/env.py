from logging.config import fileConfig
from alembic import context
from sqlalchemy import engine_from_config, pool
import os, sys

# Ensure the 'app' package is importable when running Alembic from this folder
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from app.db import Base
import app.orm_models  # noqa: F401  # register ORM tables

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

def run_migrations_online():
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
            compare_server_default=True,
        )
        with context.begin_transaction():
            context.run_migrations()

if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
