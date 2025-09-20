from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text, select
from sqlalchemy.orm import Session
from alembic.script import ScriptDirectory
from alembic.config import Config as AlembicConfig
from alembic.runtime.migration import MigrationContext
import os
import json, urllib.request

from app.db import get_db
from app.transactions import Transaction
from app.config import settings
from sqlalchemy.engine import make_url
from app.core.crypto_state import get_write_label, get_crypto_status
from app.services import dek_rotation as _dek_rotation  # for cached rotation stats

# Lazy/prometheus optional: define counters if prometheus_client is available
try:  # pragma: no cover - metrics optional
    from prometheus_client import Counter, Gauge
    _CRYPTO_READY = Gauge("crypto_ready", "Whether crypto subsystem loaded DEK (1=ready,0=not)")
    _CRYPTO_MODE = Gauge("crypto_mode_env", "Crypto mode flag (1 if env-wrapped active key)")
    _CRYPTO_KEYS_TOTAL = Gauge("crypto_keys_total", "Total encryption key rows")
    _CRYPTO_ACTIVE_LABEL_AGE = Gauge("crypto_active_label_age_seconds", "Approx age (seconds) of active label")
except Exception:  # pragma: no cover - silently disable
    _CRYPTO_READY = _CRYPTO_MODE = _CRYPTO_KEYS_TOTAL = _CRYPTO_ACTIVE_LABEL_AGE = None

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
        base_ollama = getattr(settings, "OLLAMA_BASE_URL", "http://ollama:11434").rstrip('/')
        url = f"{base_ollama}/api/tags"
        with urllib.request.urlopen(url, timeout=1.0) as resp:
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
        base_ollama = getattr(settings, "OLLAMA_BASE_URL", "http://ollama:11434").rstrip('/')
        url = f"{base_ollama}/api/generate"
        req = urllib.request.Request(
            url,
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

    # Prefer Alembic runtime MigrationContext to read current DB revision and compare with code head
    try:
        conn = db.connection()
        context = MigrationContext.configure(conn)
        current_rev = context.get_current_revision()
        # Code head from alembic scripts
        alembic_ini = os.path.join(os.getcwd(), "alembic.ini")
        cfg = AlembicConfig(alembic_ini) if os.path.exists(alembic_ini) else AlembicConfig()
        script = ScriptDirectory.from_config(cfg)
        head_rev = script.get_current_head()
        alembic = {"db_revision": current_rev, "code_head": head_rev, "in_sync": (current_rev == head_rev and current_rev is not None)}
    except Exception:
        alembic = _alembic_status(db)
    status = "ok" if ok and models_ok and alembic["in_sync"] else "degraded"
    # DB engine string without sensitive details
    try:
        url = make_url(settings.DATABASE_URL)
        db_engine = f"{url.get_backend_name()}+{url.get_driver_name()}"
    except Exception:
        db_engine = None
    crypto = get_crypto_status(db)
    return {
        "status": status,
        "db": {"reachable": ok, "models_ok": models_ok},
        "alembic": alembic,
        # Convenience shorthand fields for UI logs
        "db_engine": db_engine,
        "models_ok": models_ok,
    "alembic_ok": bool(alembic.get("in_sync")),
    "db_revision": alembic.get("db_revision"),
    # crypto details
    "crypto_ready": crypto.get("ready"),
    "crypto_mode": crypto.get("mode"),
    "crypto_label": crypto.get("label"),
    "crypto_kms_key": crypto.get("kms_key_id"),
    }


@router.get("/encryption/status")
def encryption_status(db: Session = Depends(get_db)):
    """Debug endpoint: shows current write_label and available encryption key labels."""
    wl = None
    try:
        wl = get_write_label()
    except Exception:
        wl = None
    try:
        rows = db.execute(text(
            "SELECT label, created_at, dek_wrap_nonce FROM encryption_keys ORDER BY created_at DESC"
        )).fetchall()
        keys = []
        for r in rows:
            nonce = getattr(r, "dek_wrap_nonce", None)
            scheme = "gcp_kms" if (nonce is None or (isinstance(nonce, (bytes, bytearray)) and len(nonce) == 0)) else "aesgcm"
            keys.append({
                "label": r.label,
                "created_at": (r.created_at.isoformat() if getattr(r, "created_at", None) else None),
                "wrap_scheme": scheme,
            })
    except Exception:
        keys = []
    out = {
        "write_label": wl or "active",
        "keys": keys,
        "active_present": any((k.get("label") == "active") for k in keys),
        "total_keys": len(keys),
    }
    # Update Gauges if available
    if _CRYPTO_KEYS_TOTAL:
        try:
            _CRYPTO_KEYS_TOTAL.set(len(keys))
            # Determine active key age (approx) if created_at timestamps present
            active_ts = None
            for k in keys:
                if k.get("label") == "active" and k.get("created_at"):
                    from datetime import datetime, timezone
                    try:
                        active_ts = datetime.fromisoformat(k["created_at"].replace("Z",""))
                    except Exception:
                        active_ts = None
                    break
            if active_ts:
                from datetime import datetime, timezone
                _CRYPTO_ACTIVE_LABEL_AGE.set(max(0, (datetime.now(timezone.utc) - active_ts).total_seconds()))
        except Exception:
            pass
    return out


@router.get("/ready")
def ready(db: Session = Depends(get_db)):
    # If encryption is explicitly disabled, consider service ready
    if os.environ.get("ENCRYPTION_ENABLED", "1") == "0":
        return {"ok": True, "crypto_ready": False, "mode": None}
    st = get_crypto_status(db)
    if not st.get("ready"):
        raise HTTPException(status_code=503, detail={"crypto_ready": False, **st})
    return {"ok": True, **st}


@router.get("/metrics/health")
def metrics_health(db: Session = Depends(get_db)):
    """Lightweight JSON metrics (alternative to Prometheus scrape)."""
    crypto = get_crypto_status(db)
    try:
        rot = getattr(_dek_rotation, "_last_rotation_stats", {}) or {}
    except Exception:
        rot = {}
    return {
        "crypto_ready": crypto.get("ready"),
        "crypto_mode": crypto.get("mode"),
        "crypto_label": crypto.get("label"),
        "rotation": rot,
    }
