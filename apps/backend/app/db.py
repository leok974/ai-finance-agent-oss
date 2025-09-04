from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from .config import settings


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
