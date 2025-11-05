from fastapi import APIRouter
import os
from app.status_utils import check_db, check_migrations

router = APIRouter()


@router.get("/ready")
def ready():
    db_url = os.getenv("DATABASE_URL", "")
    db = check_db(db_url) if db_url else None
    mig = check_migrations()
    ok = bool(db and db.ok) and mig.ok
    return {
        "ok": ok,
        "db": db.__dict__ if db else {"ok": False, "error": "missing_url"},
        "migrations": mig.__dict__,
    }


__all__ = ["router"]
