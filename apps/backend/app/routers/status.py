from fastapi import APIRouter, Depends
from typing import Dict, Any, Optional
import os
import time

from app.utils.auth import (
    get_current_user as _get_current_user,
)  # returns User or raises
from app.orm_models import User
from app.status_utils import (
    check_db,
    check_migrations,
    check_crypto_via_env,
    check_llm_health_sync,
)

router = APIRouter()


def get_current_user_optional() -> Optional[User]:  # lightweight shim
    try:
        return _get_current_user()  # FastAPI will inject request/creds
    except Exception:
        return None


@router.get("/status")
def status(user: Optional[User] = Depends(get_current_user_optional)) -> Dict[str, Any]:
    started = time.time()

    db_url = os.getenv("DATABASE_URL", "")
    db = check_db(db_url) if db_url else None
    mig = check_migrations()
    crypto = check_crypto_via_env()
    llm = check_llm_health_sync()

    elapsed_ms = int((time.time() - started) * 1000)

    probes = [x for x in [db, mig, crypto, llm] if x]
    all_ok = all(s.ok for s in probes)

    return {
        "ok": all_ok,
        "t_ms": elapsed_ms,
        "auth": {
            "logged_in": user is not None,
            "email": getattr(user, "email", None),
        },
        "version": {
            "backend_branch": os.getenv("BACKEND_BRANCH", "unknown"),
            "backend_commit": os.getenv("BACKEND_COMMIT", "unknown"),
        },
        "db": db.__dict__ if db else {"ok": False, "error": "missing_url"},
        "migrations": mig.__dict__,
        "crypto": crypto.__dict__,
        "llm": llm.__dict__,
    }
