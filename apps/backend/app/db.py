import os
import app.env_bootstrap  # ensure DATABASE_URL secret file processed early
from sqlalchemy import create_engine, event
from sqlalchemy.pool import StaticPool
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from .config import settings

# If a DATABASE_URL env var is now present (loaded by env_bootstrap) and the settings
# object still reflects the sqlite fallback, patch it so engine creation targets the
# real database. This handles import-order races where .config was imported before
# env_bootstrap.
_env_url = os.getenv("DATABASE_URL")
if (
    _env_url
    and _env_url != settings.DATABASE_URL
    and settings.DATABASE_URL.startswith("sqlite")
):
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


_url = settings.DATABASE_URL
_kwargs = dict(
    connect_args=_connect_args(_url),
    pool_pre_ping=True,
    future=True,
    echo=False,
)
# Apply sensible pooling defaults for non-SQLite engines to avoid stale connections
if not _url.startswith("sqlite"):
    _kwargs.update(
        dict(
            pool_recycle=1800,  # recycle idle connections (~30m)
            pool_size=5,  # local dev defaults; overridden by env/driver as needed
            max_overflow=10,
        )
    )
if _url.startswith("sqlite") and ":memory:" in _url:
    # Share the same in-memory DB across multiple connections (required for tests
    # where the test client and fixture sessions need to see the same data).
    _kwargs["poolclass"] = StaticPool  # type: ignore[assignment]
    # For pysqlite driver ensure same-thread disabled already via connect_args

engine = create_engine(_url, **_kwargs)

# Enable SQLite WAL mode for better concurrency
if _url.startswith("sqlite") and ":memory:" not in _url:

    @event.listens_for(engine, "connect")
    def _sqlite_pragma(dbapi_conn, _):
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA journal_mode=WAL;")
        cur.execute("PRAGMA synchronous=NORMAL;")
        cur.close()


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
