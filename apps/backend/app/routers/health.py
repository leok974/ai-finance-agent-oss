from fastapi import APIRouter, Depends
from sqlalchemy import text, select
from sqlalchemy.orm import Session
from alembic.script import ScriptDirectory
from alembic.config import Config as AlembicConfig
import os
import json, urllib.request

from app.db import get_db
from app.orm_models import Transaction
from app.config import settings
from sqlalchemy.engine import make_url

router = APIRouter(tags=["health"])

def _db_ping(db: Session) -> bool:
    try:
        db.execute(text("SELECT 1"))
        return True
    except Exception:
        return False

def _alembic_status(db: Session):
    # DB revision (from alembic_version)
    try:
        row = db.execute(text("SELECT version_num FROM alembic_version")).first()
        db_rev = row[0] if row else None
    except Exception:
        db_rev = None

    # Codebase head (from alembic script)
    try:
        # finds alembic.ini next to your alembic/ folder
        alembic_ini = os.path.join(os.getcwd(), "alembic.ini")
        cfg = AlembicConfig(alembic_ini) if os.path.exists(alembic_ini) else AlembicConfig()
        script = ScriptDirectory.from_config(cfg)
        heads = script.get_heads()
        code_head = heads[0] if heads else None
    except Exception:
        code_head = None

    return {"db_revision": db_rev, "code_head": code_head, "in_sync": (db_rev == code_head and db_rev is not None)}

def _ollama_tags():
    try:
        with urllib.request.urlopen("http://127.0.0.1:11434/api/tags", timeout=1.0) as resp:
            data = json.loads(resp.read().decode("utf-8", errors="ignore"))
            models = []
            if isinstance(data, dict) and isinstance(data.get("models"), list):
                for m in data["models"]:
                    name = (m or {}).get("name")
                    if name:
                        models.append(name)
            return True, {"models": models}
    except Exception as e:
        return False, {"error": str(e)}

def _ollama_generate_ping(model="gpt-oss:20b"):
    try:
        body = json.dumps({"model": model, "prompt": "ping", "stream": False})
        req = urllib.request.Request(
            "http://127.0.0.1:11434/api/generate",
            data=body.encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=5.0) as resp:
            data = json.loads(resp.read().decode("utf-8", errors="ignore"))
            return True, {"reply": data.get("response", "")}
    except Exception as e:
        return False, {"error": str(e)}

@router.get("/full")
def full_health():
    api_ok = True  # if we're here, the API handled the request
    ml_ok, ml_info = _ollama_tags()
    agent_ok, agent_info = _ollama_generate_ping()

    return {
        "ok": api_ok and ml_ok and agent_ok,
        "api": {"ok": api_ok},
        "ml": {"ok": ml_ok, **ml_info},
        "agent": {"ok": agent_ok, **agent_info},
    }

@router.get("/healthz")
def healthz(db: Session = Depends(get_db)):
    ok = _db_ping(db)
    # Quick entity check (optional): ensure table exists/readable
    try:
        db.execute(select(Transaction).limit(1))
        models_ok = True
    except Exception:
        models_ok = False

    alembic = _alembic_status(db)
    status = "ok" if ok and models_ok and alembic["in_sync"] else "degraded"
    # DB engine string without sensitive details
    try:
        url = make_url(settings.DATABASE_URL)
        db_engine = f"{url.get_backend_name()}+{url.get_driver_name()}"
    except Exception:
        db_engine = None
    return {
        "status": status,
        "db": {"reachable": ok, "models_ok": models_ok},
        "alembic": alembic,
        # Convenience shorthand fields for UI logs
        "db_engine": db_engine,
        "models_ok": models_ok,
        "alembic_ok": bool(alembic.get("in_sync")),
    }
