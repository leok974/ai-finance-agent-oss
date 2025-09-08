from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from alembic.config import Config
from alembic.script import ScriptDirectory
from alembic.runtime.migration import MigrationContext
from pathlib import Path
import logging
from ..database import get_db

log = logging.getLogger(__name__)
router = APIRouter(prefix="/meta", tags=["meta"])

def _alembic_info(db: Session):
    # Current DB revision (safe)
    conn = db.connection()
    context = MigrationContext.configure(conn)
    db_rev = context.get_current_revision()

    # apps/backend (two levels up from .../app/routers/)
    base_dir = Path(__file__).resolve().parents[2]
    ini_path = base_dir / "alembic.ini"
    script_dir = base_dir / "alembic"

    heads, head, recent, code_error = [], None, [], None
    try:
        if ini_path.exists():
            cfg = Config(str(ini_path))
            cfg.set_main_option("script_location", str(script_dir))
            script = ScriptDirectory.from_config(cfg)
        else:
            script = ScriptDirectory(str(script_dir))

        heads = script.get_heads()
        head = heads[0] if heads else None
        for r in list(script.walk_revisions())[:5]:  # newest→oldest
            recent.append({
                "revision": r.revision,
                "down_revision": r.down_revision,
                "is_head": r.is_head,
                "branch_labels": list(r.branch_labels or []),
                "message": (getattr(r, "doc", None) or getattr(r, "message", None) or ""),
                "module": getattr(r, "module", "") or "",
            })
    except Exception as e:
        code_error = str(e)

    return {
        "db_revision": db_rev,
        "code_heads": heads,
        "code_head": head,
        "in_sync": (db_rev in heads) if heads else False,
        "recent_migrations": recent,
        "code_error": code_error,
    }

@router.get("/info")
def meta_info(db: Session = Depends(get_db)):
    try:
        return {
            "ok": True,
            "engine": str(db.bind.engine),
            "alembic": _alembic_info(db),
        }
    except Exception as e:
        # Log full traceback server-side, but never 500 to the browser
        log.exception("GET /meta/info failed")
        return JSONResponse(
            {
                "ok": False,
                "engine": str(getattr(getattr(db, "bind", None), "engine", "")),
                "error": str(e),
            },
            status_code=200,
        )
