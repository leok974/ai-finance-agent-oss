import os
import app.env_bootstrap  # ensure DATABASE_URL secret file processed early
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from .config import settings

# If a DATABASE_URL env var is now present (loaded by env_bootstrap) and the settings
# object still reflects the sqlite fallback, patch it so engine creation targets the
# real database. This handles import-order races where .config was imported before
# env_bootstrap.
_env_url = os.getenv("DATABASE_URL")
if _env_url and _env_url != settings.DATABASE_URL and settings.DATABASE_URL.startswith("sqlite"):
    try:
        settings.DATABASE_URL = _env_url  # type: ignore[attr-defined]
        print("[db] Patched settings.DATABASE_URL from env at import time")
    except Exception:
        pass


class Base(DeclarativeBase):
    """SQLAlchemy Declarative Base."""
    pass


def _connect_args(url: str):
    # For SQLite, disable same-thread check
    return {"check_same_thread": False} if url.startswith("sqlite") else {}


engine = create_engine(
    settings.DATABASE_URL,
    connect_args=_connect_args(settings.DATABASE_URL),
    pool_pre_ping=True,
    future=True,
    echo=False,  # flip to True if you want SQL logs
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)

# Ensure models are registered with Base when the app imports the DB module
try:
    import app.orm_models  # noqa: F401
except Exception:
    # During certain tooling/import orders this may fail; Alembic env.py also imports orm_models
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
