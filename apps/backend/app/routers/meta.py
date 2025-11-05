from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from pathlib import Path
import logging

from ..database import get_db

log = logging.getLogger(__name__)
router = APIRouter(prefix="/meta", tags=["meta"])


def _safe_alembic_info(db: Session):
    """Never raise. Returns dict with optional code_error."""
    # Current DB revision via Alembic runtime (lazy import)
    db_rev = None
    code_error = None
    heads, head, recent = [], None, []

    try:
        from alembic.runtime.migration import MigrationContext

        conn = db.connection()
        context = MigrationContext.configure(conn)
        db_rev = context.get_current_revision()
    except Exception as e:
        # If even runtime migration import fails, surface and bail gracefully
        return {
            "db_revision": db_rev,
            "code_heads": [],
            "code_head": None,
            "in_sync": False,
            "recent_migrations": [],
            "code_error": f"alembic_runtime_error: {e}",
        }

    # Try to read code heads / versions list (also lazy import)
    try:
        from alembic.config import Config
        from alembic.script import ScriptDirectory

        # backend root = apps/backend (two levels up from .../app/routers/meta.py)
        base_dir = Path(__file__).resolve().parents[2]
        ini_path = base_dir / "alembic.ini"
        script_dir = base_dir / "alembic"

        if ini_path.exists():
            cfg = Config(str(ini_path))
            cfg.set_main_option("script_location", str(script_dir))
            script = ScriptDirectory.from_config(cfg)
        else:
            script = ScriptDirectory(str(script_dir))

        heads = script.get_heads()
        head = heads[0] if heads else None

        for r in list(script.walk_revisions())[:5]:  # newest → oldest
            mod = getattr(r, "module", None)
            mod_file = getattr(mod, "__file__", None) if mod else None
            filename = Path(mod_file).name if mod_file else None

            recent.append(
                {
                    "revision": r.revision,
                    "down_revision": r.down_revision,
                    "is_head": r.is_head,
                    "branch_labels": list(r.branch_labels or []),
                    "message": (
                        getattr(r, "doc", None) or getattr(r, "message", None) or ""
                    ),
                    "filename": filename,
                }
            )

    except Exception as e:
        code_error = f"alembic_code_error: {e}"

    return {
        "db_revision": db_rev,
        "code_heads": heads,
        "code_head": head,
        "in_sync": (db_rev in heads) if heads else False,
        "recent_migrations": recent,
        "code_error": code_error,
    }


@router.get("/meta/info")  # optional: keep both /meta/info and /meta for safety
@router.get("/info")
def meta_info(db: Session = Depends(get_db)):
    try:
        payload = {
            "ok": True,
            "engine": str(db.bind.engine),
            "alembic": _safe_alembic_info(db),
        }
        return JSONResponse(payload, status_code=200)
    except Exception as e:
        log.exception("GET /meta/info failed")
        # Never 500; return ok:false so UI can render once and stop retrying
        return JSONResponse(
            {
                "ok": False,
                "engine": str(getattr(getattr(db, "bind", None), "engine", "")),
                "error": str(e),
            },
            status_code=200,
        )
