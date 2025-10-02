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
try:  # version info (branch/commit) optional
    from app import version as app_version
except Exception:  # pragma: no cover
    class _V:  # fallback placeholder
        GIT_BRANCH = "unknown"
        GIT_COMMIT = "unknown"
    app_version = _V()  # type: ignore
from app.services import dek_rotation as _dek_rotation  # for cached rotation stats

# Lazy/prometheus optional: define counters if prometheus_client is available
try:  # pragma: no cover - metrics optional
    from prometheus_client import Counter, Gauge
    _CRYPTO_READY = Gauge("crypto_ready", "Whether crypto subsystem loaded DEK (1=ready,0=not)")
    _CRYPTO_MODE = Gauge("crypto_mode_env", "Crypto mode flag (1 if env-wrapped active key)")
    _CRYPTO_KEYS_TOTAL = Gauge("crypto_keys_total", "Total encryption key rows")
    _CRYPTO_ACTIVE_LABEL_AGE = Gauge("crypto_active_label_age_seconds", "Approx age (seconds) of active label")
    _ALEMBIC_DIVERGED = Gauge("alembic_multiple_heads", "1 if multiple Alembic heads detected")
    _HEALTH_REASON = Gauge("health_reason", "Health reason active flag (1=present)", ["reason", "severity"])  # small bounded label set
    _HEALTH_OVERALL = Gauge("health_overall", "Overall health status (1=ok,0=degraded)")
except Exception:  # pragma: no cover - silently disable
    _CRYPTO_READY = _CRYPTO_MODE = _CRYPTO_KEYS_TOTAL = _CRYPTO_ACTIVE_LABEL_AGE = _ALEMBIC_DIVERGED = _HEALTH_REASON = _HEALTH_OVERALL = None

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


def classify_health(reasons, strict: bool | None = None):  # pragma: no cover - simple logic
    """Return normalized health classification structure.
    reasons: list of raw reasons (info + warn). We treat crypto_disabled as informational.
    strict: optional override; if None derive from env.
    Output keys: ok, status, reasons (warnings only), info_reasons, warn_reasons.
    Also updates Prometheus reason gauges if available.
    """
    if strict is None:
        strict = os.getenv("CRYPTO_STRICT_STARTUP", "0").lower() in {"1","true","yes","on"}
    info_set = {"crypto_disabled"}
    info_reasons = [r for r in reasons if r in info_set]
    warn_reasons = [r for r in reasons if r not in info_set]
    only_info = len(reasons) > 0 and all(r in info_set for r in reasons)
    if not reasons or (only_info and not strict):
        status = "ok"
        ok_flag = True
    else:
        status = "degraded"
        ok_flag = False
    output_reasons = reasons if strict else warn_reasons
    # Metrics update
    try:
        from app.routers.health import _HEALTH_REASON, _HEALTH_OVERALL  # circular safe at runtime
        if _HEALTH_REASON is not None:
            known = {"alembic_out_of_sync", "multiple_alembic_heads", "crypto_not_ready", "crypto_disabled", "db_unreachable", "models_unreadable"}
            for r in known:
                sev = "info" if r in info_set else "warn"
                _HEALTH_REASON.labels(reason=r, severity=sev).set(1.0 if r in reasons else 0.0)
        if _HEALTH_OVERALL is not None:
            _HEALTH_OVERALL.set(1.0 if ok_flag else 0.0)
    except Exception:
        pass
    return {
        "ok": ok_flag,
        "status": status,
        "reasons": output_reasons,
        "info_reasons": info_reasons,
        "warn_reasons": warn_reasons,
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
    crypto_enabled_env = os.getenv("ENCRYPTION_ENABLED", "1").lower() in {"1","true","yes","on"}
    if not crypto_enabled_env:
        # Override to explicit disabled state (even if keys present) to avoid confusion
        crypto = {"ready": False, "mode": "disabled", "label": None, "kms_key_id": None}
    # Attach rotation stats if a rotation is in progress or cached
    try:
        rotation_stats = getattr(_dek_rotation, "_last_rotation_stats", {}) or {}
    except Exception:
        rotation_stats = {}
    # Migration divergence flag from app.state (set in main lifespan)
    try:
        migration_diverged = getattr(__import__("app.main").main.app.state, "migration_diverged", None)  # type: ignore
    except Exception:
        migration_diverged = None

    reasons = []  # entries: 'alembic_out_of_sync', 'multiple_alembic_heads', 'crypto_not_ready', 'crypto_disabled'
    if not ok:
        reasons.append("db_unreachable")
    if not models_ok:
        reasons.append("models_unreadable")
    if not alembic.get("in_sync"):
        reasons.append("alembic_out_of_sync")
    if migration_diverged:
        reasons.append("multiple_alembic_heads")
    if crypto.get("mode") == "disabled":
        reasons.append("crypto_disabled")
    elif not crypto.get("ready"):
        reasons.append("crypto_not_ready")
    # Determine informational vs warning reasons
    classification = classify_health(reasons)
    ok_flag = classification["ok"]
    overall_status = classification["status"]
    output_reasons = classification["reasons"]
    info_reasons = classification["info_reasons"]
    warn_reasons = classification["warn_reasons"]
    # Expose version info and explicit ok flag; reasons always a list
    version_info = {"branch": getattr(app_version, "GIT_BRANCH", "unknown"), "commit": getattr(app_version, "GIT_COMMIT", "unknown"), "build_time": getattr(app_version, "BUILD_TIME", "unknown")}
    if _ALEMBIC_DIVERGED is not None and migration_diverged is not None:  # pragma: no cover
        try:
            _ALEMBIC_DIVERGED.set(1.0 if migration_diverged else 0.0)
        except Exception:
            pass
    return {
        "ok": ok_flag,
        "status": overall_status,
    "reasons": output_reasons,
        "info_reasons": info_reasons,
        "warn_reasons": warn_reasons,
        "db": {"reachable": ok, "models_ok": models_ok},
        "alembic": alembic,
        "migration_diverged": bool(migration_diverged) if migration_diverged is not None else None,
        "db_engine": db_engine,
        "alembic_ok": bool(alembic.get("in_sync")),
        "db_revision": alembic.get("db_revision"),
        "crypto_ready": crypto.get("ready"),
        "crypto_mode": crypto.get("mode"),
        "crypto_label": crypto.get("label"),
        "crypto_kms_key": crypto.get("kms_key_id"),
        "rotation": rotation_stats if rotation_stats else None,
        "version": version_info,
    }

@router.get("/health/simple")
def health_simple(db: Session = Depends(get_db)):
    """Lightweight health for probes: only DB reachability + minimal metadata.
    Returns 200 JSON: { ok: bool, db: bool, branch, commit }
    Avoids heavy Alembic + crypto checks used in /healthz.
    """
    db_ok = _db_ping(db)
    try:
        branch = getattr(app_version, "GIT_BRANCH", "unknown")
        commit = getattr(app_version, "GIT_COMMIT", "unknown")
    except Exception:
        branch, commit = "unknown", "unknown"
    return {"ok": db_ok, "db": db_ok, "branch": branch, "commit": commit}

# Alias path without slash for environments that block nested health style
@router.get("/health_simple")
def health_simple_alias(db: Session = Depends(get_db)):
    return health_simple(db)  # reuse logic


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

@router.get("/live")
def live():
    """Pure liveness endpoint: no DB, crypto, or Alembic access. Always ok."""
    return {"ok": True}


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


@router.get("/metrics/crypto")
def metrics_crypto(db: Session = Depends(get_db)):
    """Detailed crypto metrics including ETA & sampled failures (JSON)."""
    crypto = get_crypto_status(db)
    rot = getattr(_dek_rotation, "_last_rotation_stats", {}) or {}
    # Expose recent fail samples by invoking a lightweight introspection of cached stats via health encryption endpoint
    enc = encryption_status(db)  # reuse existing logic for key listing
    return {
        "crypto": {
            "ready": crypto.get("ready"),
            "mode": crypto.get("mode"),
            "label": crypto.get("label"),
            "kms_key_id": crypto.get("kms_key_id"),
            "keys_total": enc.get("total_keys"),
        },
        "rotation": rot,
    }
