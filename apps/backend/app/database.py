# apps/backend/app/database.py
from __future__ import annotations
import os
from typing import Generator, Optional

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session, declarative_base

DATABASE_URL: str = os.getenv(
    "DATABASE_URL",
    "sqlite:///./app/data/dev.sqlite3",  # local fallback for convenience
)

# SQLite needs a special connect arg; Postgres does not.
is_sqlite = DATABASE_URL.startswith("sqlite")

engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    connect_args={"check_same_thread": False} if is_sqlite else {},
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db() -> Generator[Session, None, None]:
    """
    FastAPI dependency that yields a SQLAlchemy Session and ensures it closes.
    Tests can override this dependency (your conftest does).
    """
    db: Optional[Session] = None
    try:
        db = SessionLocal()
        yield db
    finally:
        if db is not None:
            db.close()
