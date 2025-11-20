import app.env_bootstrap  # earliest import: loads DATABASE_URL from file secret if provided
from fastapi import FastAPI, APIRouter, Request, HTTPException
from fastapi.responses import RedirectResponse, JSONResponse
from .startup_guard import require_db_or_exit
from contextlib import asynccontextmanager
import asyncio
from .db import Base, engine
from sqlalchemy import inspect
from sqlalchemy import text
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response, PlainTextResponse
from starlette.middleware.sessions import SessionMiddleware

# Proxy headers middleware location differs across versions; try Starlette then fallback to Uvicorn
try:
    from starlette.middleware.proxy_headers import ProxyHeadersMiddleware  # type: ignore
except Exception:  # pragma: no cover - fallback for older stacks
    try:
        from uvicorn.middleware.proxy_headers import ProxyHeadersMiddleware  # type: ignore
    except Exception:
        ProxyHeadersMiddleware = None  # type: ignore
from starlette.middleware.trustedhost import TrustedHostMiddleware
import os
import sys
from . import config as app_config
from app.config import settings
from .routers import ingest, txns, rules, ml, report, budget, alerts, insights, explain
import os as _os

_HERMETIC = _os.getenv("HERMETIC") == "1"
if not _HERMETIC:
    from .routers import agent
from app.routers import analytics
from app.routers import analytics_receiver  # new lightweight event ingest
from app.routers import analytics_events as analytics_events_router
from app.routers import llm_health as llm_health_router
from app.routers import llm_echo as llm_echo_router
from app.routers import status as status_router
from app.routers import live as live_router
from app.routers import ready as ready_router
from .routers import meta
from app.routers import agent_tools_transactions as agent_tools_txn
from app.routers import agent_tools_budget as agent_tools_budget
from app.routers import agent_tools_insights as agent_tools_insights
from app.routers import agent_tools_charts as agent_tools_charts
from app.routers import agent_tools_rules as agent_tools_rules
from app.routers import (
    agent_tools_rules_save as agent_tools_rules_save,
)  # new save endpoint
from app.routers import agent_tools_rules_crud as rules_crud_router
from app.routers import agent_tools_rules_apply_all as rules_apply_all_router
from app.routers import agent_tools_meta as meta_router
from app.routers import agent_tools_categorize as agent_tools_categorize_router
from app.routers import categorize_admin as categorize_admin_router
from app.routers import agent_tools_suggestions as agent_tools_suggestions_router
from app.routers import suggestions as suggestions_router  # ML suggestions
from app.routers import ml_status as ml_status_router  # ML status endpoint
from app.routers import ml_feedback as ml_feedback_router  # ML feedback endpoint
from .routers import charts
from app.routers import txns_edit as txns_edit_router
from app.routers import auth as auth_router
from app.routers import auth_dev as auth_dev_router
from app.routers import e2e_session as e2e_session_router  # E2E test session mint
from app.routers import agent_txns  # NEW
from app.routers import help_ui as help_ui_router
from .routers import transactions as transactions_router
from app.routers.transactions_nl import router as transactions_nl_router
from .routers import dev as dev_router
from app.routers import metrics as metrics_router
from app.routers import admin as admin_router
from app.routers import admin_maintenance as admin_maintenance_router
from .routers import health as health_router
from .routers import agent_plan as agent_plan_router
from app.routers import rag as rag_router
from app.routers import agent_tools_rag as agent_tools_rag_router
from app.routers import agent_tools_meta as agent_tools_meta_router
from app.routers import agent_tools_charts as agent_tools_charts_router
from app.routers import agent_tools_transactions as agent_tools_transactions_router
from app.routers import agent_tools_rules as agent_tools_rules_router
from app.routers import agent_tools_rules_crud as agent_tools_rules_crud_router
from app.routers import agent_tools_rules_save as agent_tools_rules_save_router
from app.routers import (
    agent_tools_rules_apply_all as agent_tools_rules_apply_all_router,
)
from app.routers import agent_tools_budget as agent_tools_budget_router
from app.routers import agent_tools_insights as agent_tools_insights_router
from app.routers import agent_actions as agent_actions_router
from app.routers import agent_session as agent_session_router  # NEW: session management
from app.routers import dev_overlay as dev_overlay_router
from app.routers import agent_describe as agent_describe_router  # NEW: contextual help
from app.routes import csp as csp_routes
from app.routes import (
    metrics as metrics_routes,
)  # provides fallback metrics if instrumentation missing
from app.routes import (
    edge_metrics as edge_metrics_routes,
)  # NEW: ingest edge-observed metrics
from .utils.state import load_state, save_state
import logging
import time
import traceback

try:
    import orjson  # type: ignore

    def _dumps(obj):  # returns bytes
        return orjson.dumps(obj)

except Exception:  # pragma: no cover
    import json as _json_mod

    def _dumps(obj):  # returns bytes
        return _json_mod.dumps(obj, separators=(",", ":"), ensure_ascii=False).encode(
            "utf-8"
        )


import subprocess
from app.services.crypto import EnvelopeCrypto
from app.core.crypto_state import set_crypto, set_active_label
from app.db import SessionLocal
from app.core.crypto_state import load_and_cache_active_dek
from app.middleware.request_logging import RequestLogMiddleware
from app.middleware.request_id import RequestIdMiddleware
from datetime import datetime, timezone

try:  # Prefer ultra-fast orjson if present
    pass  # type: ignore
except Exception:  # pragma: no cover - fallback
    pass  # type: ignore

logger = logging.getLogger(__name__)

_LLM_PATH_MIDDLEWARE_ATTACHED = (
    False  # guard to avoid duplicate registration under reloads
)

# Global upload size limit (fail-fast at ASGI level)
MAX_UPLOAD_MB = 5


class LimitBodySizeMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        # Only guard ingest (cheap path check)
        if request.url.path.startswith("/ingest"):
            cl = request.headers.get("content-length")
            try:
                size = int(cl) if cl else None
            except ValueError:
                size = None
            if size is not None and size > MAX_UPLOAD_MB * 1024 * 1024:
                return PlainTextResponse("Request Entity Too Large", status_code=413)
        return await call_next(request)


# Sanitize and log DB connection origin (dev aid only; omits password)
try:
    _db_url = os.environ.get("DATABASE_URL", "")
    if _db_url:
        # Strip password section: postgresql+psycopg://user:pass@host:port/db -> user@host:port/db
        import re

        _scrub = re.sub(r"(postgresql[+a-z]*://[^:]+):[^@]*@", r"\\1@", _db_url)
        logging.getLogger("uvicorn").info(f"DB connect string (sanitized)={_scrub}")
        # Additional parsed summary (no password)
        from urllib.parse import urlparse, parse_qsl

        try:
            _p = urlparse(_db_url)
            _host = _p.hostname or "?"
            _dbn = (_p.path or "/").lstrip("/") or "?"
            _ssl = dict(parse_qsl(_p.query)).get("sslmode", "default")
            logging.getLogger("uvicorn").info(
                f"[db] host={_host} db={_dbn} sslmode={_ssl}"
            )
        except Exception:
            pass
    else:
        logging.getLogger("uvicorn").warning("DATABASE_URL not set at import time")
except Exception:
    pass

# Print git info on boot
try:
    b = (
        subprocess.check_output(["git", "rev-parse", "--abbrev-ref", "HEAD"])
        .decode()
        .strip()
    )
    s = (
        subprocess.check_output(["git", "rev-parse", "--short", "HEAD"])
        .decode()
        .strip()
    )
    logging.getLogger("uvicorn").info(f"Backend booting from {b}@{s}")
except Exception:
    pass


def _dev_bootstrap_logging():
    """Bootstrap logging for dev & test with optional JSON formatting.

    Controlled by env:
      DEV_JSON_LOGS=1 -> emit structured JSON
      LOG_LEVEL       -> default INFO
    In prod (APP_ENV=prod) we defer to existing JSON logging configuration.
    """
    try:
        env = os.environ.get("APP_ENV", os.environ.get("ENV", "dev")).lower()
        if env == "prod":  # production path handled separately below
            return
        root = logging.getLogger()
        # Always replace to avoid duplicate handlers during reloads
        for h in list(root.handlers):
            root.removeHandler(h)
        h = logging.StreamHandler(sys.stdout)
        if os.getenv("DEV_JSON_LOGS") == "1":
            import json as _json

            class _F(logging.Formatter):
                def format(self, r):  # type: ignore[override]
                    return _json.dumps(
                        {
                            "lvl": r.levelname,
                            "msg": r.getMessage(),
                            "ts": r.created,
                            "logger": r.name,
                        },
                        ensure_ascii=False,
                    )

            h.setFormatter(_F())
        else:
            h.setFormatter(logging.Formatter("[%(levelname)s] %(name)s: %(message)s"))
        root.addHandler(h)
        level = os.getenv("LOG_LEVEL", "INFO").upper()
        try:
            root.setLevel(level)
        except Exception:
            root.setLevel("INFO")
        # Explicitly ensure LLM logger at INFO for breadcrumbs
        logging.getLogger("app.utils.llm").setLevel(logging.INFO)
    except Exception:
        pass


# Production JSON logging keeps previous behavior
try:
    if os.environ.get("APP_ENV", os.environ.get("ENV", "dev")).lower() == "prod":
        from app.logging import configure_json_logging

        configure_json_logging("INFO")
    else:
        _dev_bootstrap_logging()
except Exception:
    pass

app = FastAPI(
    title="AI Finance Agent",
    version="0.1.0",
    openapi_url="/openapi.json",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=None,  # will attach below
)


# Reset OpenAPI schema cache on startup to ensure fresh schema from current models
@app.on_event("startup")
async def _reset_openapi_cache():
    """Ensure /openapi.json is rebuilt from current models on each cold start."""
    app.openapi_schema = None


# Global exception handler to log unhandled errors (prevents silent 500s)
logger = logging.getLogger("uvicorn.error")


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    """Log unhandled exceptions with full traceback."""
    logger.error(
        "Unhandled exception in API request %s %s:\n%s",
        request.method,
        request.url.path,
        "".join(traceback.format_exc()),
    )
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
    )


# Production safety check: forbid dev credentials in prod environment
if settings.APP_ENV == "prod" or settings.ENV == "prod":
    if settings.DEV_SUPERUSER_EMAIL or settings.DEV_SUPERUSER_PIN:
        logger.warning(
            "⚠️  DEV_SUPERUSER_EMAIL or DEV_SUPERUSER_PIN present in production environment. "
            "These settings are ignored in prod for security. Please remove them from production config."
        )

# Attach LLM path injection middleware (after final app instantiation)
from fastapi import Request as _FastRequest

if not _LLM_PATH_MIDDLEWARE_ATTACHED:  # pragma: no cover - simple guard

    @app.middleware("http")
    async def _ensure_llm_path_header(
        request: _FastRequest, call_next
    ):  # pragma: no cover - exercised via tests
        if not hasattr(request.state, "llm_path"):
            request.state.llm_path = "unknown"
        response = await call_next(request)
        if "X-LLM-Path" not in response.headers:
            response.headers["X-LLM-Path"] = getattr(
                request.state, "llm_path", "unknown"
            )
        return response

    _LLM_PATH_MIDDLEWARE_ATTACHED = True

# Fail fast immediately if DB misconfigured (after app exists)
require_db_or_exit()
app.add_middleware(RequestIdMiddleware)  # must precede others for rid context

# === OAuth Session Middleware ===
# Session middleware for OAuth state management
app.add_middleware(
    SessionMiddleware,
    secret_key=os.getenv("SESSION_SECRET", "dev-secret"),
    session_cookie="lm_oauth_session",  # Distinct cookie name to avoid conflicts
    same_site="none",  # Required for OAuth cross-site redirects (Google callback)
    https_only=bool(int(os.getenv("COOKIE_SECURE", "0"))),
    max_age=60 * 60 * 24 * 7,  # 7 days
    domain=os.getenv("COOKIE_DOMAIN") if os.getenv("COOKIE_DOMAIN") else None,
)
# === /OAuth Session Middleware ===

try:
    # Lightweight best-effort startup self-checks (Postgres only) for
    # migration head count & performance index presence.
    from app import startup_checks as _startup_checks  # type: ignore

    _startup_checks.run_all()
except Exception:  # pragma: no cover - non-fatal
    pass
# --- Help Rephrase Enablement ---------------------------------------------------
# Force-enable help/describe rephrase path in production unless explicitly disabled.
# Precedence:
#   1. HELP_REPHRASE_ENABLED (explicit on/off)
#   2. HELP_REPHRASE_FORCE_DISABLE (hard off even if enabled elsewhere)
#   3. If neither set: enabled when APP_ENV=prod, else fallback to settings.HELP_REPHRASE_DEFAULT
try:
    _env = os.environ.get("APP_ENV", os.environ.get("ENV", "dev")).lower()
    _explicit = os.environ.get("HELP_REPHRASE_ENABLED")
    if _explicit is not None:
        _help_rephrase_enabled = _explicit.lower() in {"1", "true", "yes", "on"}
    else:
        _help_rephrase_enabled = (
            True if _env == "prod" else settings.HELP_REPHRASE_DEFAULT
        )
    if os.environ.get("HELP_REPHRASE_FORCE_DISABLE", "").lower() in {
        "1",
        "true",
        "yes",
        "on",
    }:
        _help_rephrase_enabled = False
    app.state.help_rephrase_enabled = _help_rephrase_enabled
except Exception:
    app.state.help_rephrase_enabled = settings.HELP_REPHRASE_DEFAULT

# Central runtime toggles registry (extendable). Values are simple booleans for now.
if not hasattr(app.state, "runtime_toggles"):
    app.state.runtime_toggles = {
        "help_rephrase_enabled": getattr(
            app.state, "help_rephrase_enabled", settings.HELP_REPHRASE_DEFAULT
        ),
    }
# Enable JSON logs in production
try:
    if os.environ.get("APP_ENV", os.environ.get("ENV", "dev")).lower() == "prod":
        from app.logging import configure_json_logging

        configure_json_logging("INFO")
        # Request logging middleware (prod only)
        app.add_middleware(RequestLogMiddleware)
        # Trust proxy headers from configured CIDRs/IP (prod only)
        cidrs_env = os.environ.get("TRUSTED_PROXY_CIDRS", "").strip()
        ips_env = os.environ.get("TRUSTED_PROXY_IP", "").strip()
        cidrs = [c.strip() for c in cidrs_env.split(",") if c.strip()]
        ips = [h.strip() for h in ips_env.split(",") if h.strip()]
        trusted = (
            cidrs or ips or ["172.16.0.0/12"]
        )  # fallback to Docker private range if unset
        if ProxyHeadersMiddleware is not None:
            app.add_middleware(ProxyHeadersMiddleware, trusted_hosts=trusted)
        # Restrict Host header (include 127.0.0.1 for local healthcheck)
        # Build allowlist from env + known defaults
        hosts = ["backend", "localhost", "127.0.0.1"]
        try:
            from urllib.parse import urlparse

            # Explicit allowlist via env (comma-separated)
            env_allow = os.environ.get("ALLOWED_HOSTS", "").strip()
            if env_allow:
                hosts += [h.strip() for h in env_allow.split(",") if h.strip()]
            # Frontend origin host (e.g., https://ledger-mind.org)
            fo = os.environ.get("FRONTEND_ORIGIN", "").strip()
            if fo:
                h = urlparse(fo).hostname
                if h:
                    hosts.append(h)
            # Derive from CORS allow origins
            cors_env = os.environ.get("CORS_ALLOW_ORIGINS", "").strip()
            for o in [
                s.strip().strip('"').strip("'")
                for s in cors_env.split(",")
                if s.strip()
            ]:
                h = urlparse(o).hostname if "://" in o else o
                if h:
                    hosts.append(h)
        except Exception:
            pass
        # De-duplicate while keeping order
        hosts = list(dict.fromkeys(hosts))
        app.add_middleware(TrustedHostMiddleware, allowed_hosts=hosts)
except Exception:
    pass

# Register CSP reporting route (under /api for consistency with other endpoints)
try:
    app.include_router(csp_routes.router, prefix="/api")
except Exception:
    pass


@app.get("/ping")
def root_ping():
    return {"ok": True}


def _create_tables_dev():
    try:
        if engine.url.get_backend_name().startswith("sqlite"):
            insp = inspect(engine)
            if "alembic_version" not in insp.get_table_names():
                Base.metadata.create_all(bind=engine)
    except Exception:
        pass


# CORS allowlist from settings (defaults include 5173/5174 on localhost + 127.0.0.1)
ALLOW_ORIGINS = app_config.ALLOW_ORIGINS

app.add_middleware(LimitBodySizeMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOW_ORIGINS,  # Keep tight in prod via env
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-CSRF-Token"],
    expose_headers=["Content-Disposition"],
)


config_router = APIRouter()


@config_router.get(
    "/config", tags=["meta"], summary="Runtime configuration snapshot (non-sensitive)"
)
def get_config_snapshot():
    try:
        from app.services import help_cache

        cache_stats = help_cache.stats()
    except Exception:
        cache_stats = {"hits": 0, "misses": 0, "size": 0}
    return {
        "env": settings.ENV,
        "debug": settings.DEBUG,
        "help_rephrase_default": settings.HELP_REPHRASE_DEFAULT,
        "help_rephrase_enabled": getattr(
            app.state, "help_rephrase_enabled", settings.HELP_REPHRASE_DEFAULT
        ),
        "help_cache": cache_stats,
    }


class SecurityHeaders(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        resp: Response = await call_next(request)
        resp.headers.setdefault("X-Content-Type-Options", "nosniff")
        resp.headers.setdefault("X-Frame-Options", "DENY")
        resp.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        resp.headers.setdefault(
            "Permissions-Policy", "geolocation=(), microphone=(), camera=()"
        )
        # Prefer HSTS at the TLS proxy; set here for completeness
        resp.headers.setdefault(
            "Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload"
        )
        return resp


app.add_middleware(SecurityHeaders)

# Optional: Prometheus metrics (disable if not needed)
_metrics_attached = False
try:  # Prefer full instrumentation if library available
    from prometheus_fastapi_instrumentator import Instrumentator  # type: ignore

    # Force import of services.metrics to ensure counters are registered before exposure

    Instrumentator().instrument(app).expose(
        app, endpoint="/metrics", include_in_schema=False
    )
    _metrics_attached = True
except Exception:
    _metrics_attached = False

if not _metrics_attached:
    # Fallback simple /metrics from metrics_routes (already includes CSP fallback counter)
    app.include_router(metrics_routes.router, prefix="/api")
else:
    # Always provide compatibility alias /api/metrics regardless of prometheus_client availability.
    # Use a redirect to /metrics so we don't duplicate generation logic or depend on prometheus_client import.
    if not any(
        getattr(r, "path", None) == "/api/metrics" for r in app.routes
    ):  # pragma: no cover - simple wiring

        @app.get("/api/metrics", include_in_schema=False)
        def _metrics_alias():  # type: ignore
            # 307 keeps method (supports future POST if ever added) though Prometheus uses GET.
            return RedirectResponse(url="/metrics", status_code=307)


# Edge metrics ingestion (always mounted under /api)
try:
    app.include_router(edge_metrics_routes.router, prefix="/api")
except Exception:
    pass

# DevDiag proxy (ops endpoints)
try:
    from app.routes import devdiag_proxy

    app.include_router(devdiag_proxy.router, prefix="/api")
except Exception:
    pass

# ML Feedback endpoint
try:
    app.include_router(ml_feedback_router.router, prefix="/api")
except Exception as e:
    logger.error(f"Failed to include ml_feedback router: {e}", exc_info=True)
    pass

# Session middleware already configured above (line ~328) - don't add duplicate

# Mount RAG routers (no auth gating here; rely on global auth/CSRF config if needed)
try:
    app.include_router(rag_router.router)
    app.include_router(agent_tools_rag_router.router)
    app.include_router(agent_tools_meta_router.router)
    app.include_router(agent_tools_charts_router.router)
    app.include_router(agent_tools_categorize_router.router)
    app.include_router(agent_tools_transactions_router.router)
    app.include_router(agent_tools_rules_router.router)
    app.include_router(agent_tools_rules_crud_router.router)
    app.include_router(agent_tools_rules_save_router.router)
    app.include_router(agent_tools_rules_apply_all_router.router)
    app.include_router(agent_tools_budget_router.router)
    app.include_router(agent_tools_insights_router.router)
    app.include_router(agent_tools_suggestions_router.router)
    app.include_router(suggestions_router.router)  # ML suggestions endpoints
    app.include_router(ml_status_router.router)  # ML status endpoint
    app.include_router(agent_actions_router.router)
except Exception as e:
    logger.error(f"Failed to include agent_tools routers: {e}", exc_info=True)
    pass

# CSRF is attached per-route on unsafe endpoints only (see routers)

# Legacy in-memory stores (kept for compatibility; safe to remove if unused)
app.state.rules = []
app.state.txns = []

# Adjust crypto initialization behavior based on CRYPTO_REQUIRED flag. If crypto
# previously failed (logged above) but CRYPTO_REQUIRED explicitly set to false,
# downgrade to warning semantics so startup isn't treated as hard failure.
try:
    _crypto_required = os.getenv("CRYPTO_REQUIRED", "true").lower() in {
        "1",
        "true",
        "yes",
        "on",
    }
    if not _crypto_required:
        # The earlier errors (if any) have already been logged; emit a clarifying note.
        logging.getLogger("uvicorn").warning(
            "[crypto] disabled enforcement (CRYPTO_REQUIRED=false); operating without encryption KMS"
        )
except Exception:
    pass
app.state.user_labels = []

# Persisted state lifecycle
from contextlib import contextmanager


@contextmanager
def _session_scope():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _detect_migration_divergence(app: FastAPI):
    """Detect if multiple Alembic heads exist and stash flag on app.state.
    Only reads script directory (no DB needed)."""
    try:
        from alembic.config import Config as AlembicConfig  # type: ignore
        from alembic.script import ScriptDirectory  # type: ignore

        alembic_ini = os.path.join(os.getcwd(), "alembic.ini")
        cfg = (
            AlembicConfig(alembic_ini)
            if os.path.exists(alembic_ini)
            else AlembicConfig()
        )
        script = ScriptDirectory.from_config(cfg)
        heads = script.get_heads()
        multi = len(heads) > 1
        app.state.migration_diverged = multi
        if multi:
            logging.getLogger("uvicorn").warning(
                "alembic: multiple heads detected: %s", heads
            )
        else:
            app.state.migration_diverged = False
        # Optionally update gauge if prometheus client initialized
        try:  # pragma: no cover
            from app.routers.health import _ALEMBIC_DIVERGED  # type: ignore

            if _ALEMBIC_DIVERGED is not None:
                _ALEMBIC_DIVERGED.set(1.0 if multi else 0.0)
        except Exception:
            pass
    except Exception:
        # On failure, leave unset (healthz will treat missing as unknown)
        app.state.migration_diverged = None


async def _startup_load_state():
    try:
        load_state(app)
        logger.info("state: loaded OK")
    except Exception as e:
        logger.warning("state: load failed, continuing startup", exc_info=e)
        if os.getenv("STARTUP_STATE_STRICT", "0").lower() in {"1", "true", "yes"}:
            raise
    try:
        enabled = os.environ.get("ENCRYPTION_ENABLED", "1").lower() in {
            "1",
            "true",
            "yes",
            "on",
        }
        if enabled:
            crypto = EnvelopeCrypto.from_env(os.environ)
            set_crypto(crypto)
            label = os.environ.get("ENCRYPTION_ACTIVE_LABEL", "active")
            set_active_label(label)
            with _session_scope() as db:
                load_and_cache_active_dek(db)
                try:
                    # Emit explicit success log for operational visibility of KMS unwrap
                    key = os.environ.get("GCP_KMS_KEY", "unknown")
                    aad = os.environ.get("GCP_KMS_AAD", "unknown")
                    logging.getLogger("uvicorn").info(
                        "[CRYPTO] KMS unwrap OK | key=%s | aad=%s", key, aad
                    )
                except Exception:
                    pass
                # Active label age warning (optional)
                try:
                    threshold_days = int(
                        os.environ.get("CRYPTO_ACTIVE_AGE_WARN_DAYS", "90")
                    )
                    row = db.execute(
                        text(
                            "SELECT created_at FROM encryption_keys WHERE label='active' ORDER BY created_at DESC LIMIT 1"
                        )
                    ).first()
                    if row and getattr(row, "created_at", None):
                        created = row.created_at
                        if not isinstance(created, datetime):
                            created = datetime.fromisoformat(str(created))
                        age_days = (
                            datetime.now(timezone.utc)
                            - created.replace(tzinfo=timezone.utc)
                        ).days
                        if age_days >= threshold_days:
                            logging.getLogger("uvicorn").info(
                                "crypto: active label age=%sd exceeds threshold=%sd (label rotation recommended)",
                                age_days,
                                threshold_days,
                            )
                except Exception:
                    pass
                if os.environ.get("APP_ENV", "dev").lower() == "prod":
                    from app.core.crypto_state import (
                        get_crypto_status as _crypto_status,
                    )

                    st = _crypto_status(db)
                    # Sticky crypto: if encryption is enabled, require KMS mode (fail fast)
                    try:
                        enabled_flag = os.environ.get(
                            "ENCRYPTION_ENABLED", "1"
                        ).lower() in {"1", "true", "yes", "on"}
                        if enabled_flag and st.get("mode") != "kms":
                            logging.getLogger("uvicorn").error(
                                "Crypto mode mismatch at startup: ENCRYPTION_ENABLED=1 but crypto_mode=%s",
                                st.get("mode"),
                            )
                            import sys

                            sys.exit(1)
                    except Exception:
                        # Any unexpected error here should still stop in prod to avoid silent downgrade
                        import sys

                        sys.exit(1)
                    if not st.get("ready"):
                        logging.getLogger("uvicorn").error(
                            "Crypto NOT ready at startup: %s", st
                        )
                        strict = os.environ.get(
                            "CRYPTO_STRICT_STARTUP", "1"
                        ).lower() not in {"0", "false", "no"}
                        if strict:
                            import sys

                            sys.exit(1)
                        else:
                            logging.getLogger("uvicorn").warning(
                                "CRYPTO_STRICT_STARTUP=0 set; continuing startup without crypto ready"
                            )
            logging.getLogger("uvicorn").info("crypto: initialized (DEK cached)")
        else:
            logging.getLogger("uvicorn").info(
                "crypto: disabled (ENCRYPTION_ENABLED!=1)"
            )
    except Exception as e:
        logging.getLogger("uvicorn").error("crypto init failed: %s", e)
        # Extra diagnostics to aid KMS/AAD issues
        try:
            sa_email = None
            sa_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
            if sa_path and os.path.isfile(sa_path):
                import json  # lazy import

                with open(sa_path, "r", encoding="utf-8") as f:
                    sa_email = json.load(f).get("client_email")
            logging.getLogger("uvicorn").error(
                "crypto debug: key=%s, aad=%s, sa=%s",
                os.environ.get("GCP_KMS_KEY"),
                os.environ.get("GCP_KMS_AAD"),
                sa_email or "unknown",
            )
        except Exception:
            pass
        if os.environ.get("APP_ENV", os.environ.get("ENV", "dev")).lower() == "prod":
            # Allow operators to bypass hard-exit while fixing IAM/AAD via CRYPTO_STRICT_STARTUP=0
            if os.environ.get("CRYPTO_STRICT_STARTUP", "1").lower() not in {
                "0",
                "false",
                "no",
            }:
                import sys

                sys.exit(1)


async def _shutdown_save_state():
    save_state(app)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup sequence
    _create_tables_dev()
    # Detect migration divergence early (pure code inspection)
    _detect_migration_divergence(app)
    await _startup_load_state()
    app.state._bg_tasks = []

    # Prime Prometheus metrics so they appear in /metrics even before first sample
    try:
        from app.metrics import prime_metrics

        prime_metrics()
    except Exception:
        pass  # Metrics are optional

    # Start analytics retention loop in prod if enabled
    try:
        if os.environ.get("APP_ENV", os.environ.get("ENV", "dev")).lower() == "prod":
            keep_days = int(os.environ.get("ANALYTICS_RETENTION_DAYS", "90"))
            every_hours = int(
                os.environ.get("ANALYTICS_RETENTION_INTERVAL_HOURS", "24")
            )
            from app.services.analytics_retention import retention_loop

            t = asyncio.create_task(retention_loop(keep_days, every_hours))
            app.state._bg_tasks.append(t)
        # Start help_cache cleanup loop (all environments; low overhead) unless disabled
        if os.environ.get("HELP_CACHE_CLEANUP_DISABLE", "0").lower() not in {
            "1",
            "true",
            "yes",
            "on",
        }:
            from app.services.help_cleanup import help_cache_cleanup_loop

            interval = int(os.environ.get("HELP_CACHE_CLEANUP_INTERVAL_S", "1800"))
            t2 = asyncio.create_task(help_cache_cleanup_loop(interval))
            app.state._bg_tasks.append(t2)
    except Exception:
        pass
    try:
        yield
    finally:
        # Shutdown sequence
        try:
            await _shutdown_save_state()
        except Exception:
            pass
        for t in getattr(app.state, "_bg_tasks", []):
            t.cancel()
        if getattr(app.state, "_bg_tasks", []):
            await asyncio.gather(*app.state._bg_tasks, return_exceptions=True)
        # Dispose SQLAlchemy engine to close pooled connections (prevent ResourceWarnings).
        # Skip disposal for in-memory SQLite during test runs to avoid dropping ephemeral schema mid-suite.
        try:  # pragma: no cover - lifecycle cleanup
            from app.db import engine as _engine

            u = str(_engine.url)
            if ":memory:" not in u:
                _engine.dispose()
        except Exception:
            pass


# Attach lifespan
app.router.lifespan_context = lifespan

# Routers
app.include_router(ingest.router, prefix="")
app.include_router(txns.router, prefix="/txns", tags=["txns"])
app.include_router(rules.router)
app.include_router(ml.router)
# ML Phase 2: Production training pipeline
from app.routers import ml_v2

app.include_router(ml_v2.router)
app.include_router(report.router, prefix="", tags=["report"])
app.include_router(budget.router, prefix="/budget", tags=["budget"])
# Also mount /budgets for temp overlay endpoints
try:
    app.include_router(budget.temp_router)
except Exception:
    pass
app.include_router(alerts.router, prefix="/alerts", tags=["alerts"])
app.include_router(insights.router)
if not _HERMETIC:
    app.include_router(agent.router, prefix="/agent", tags=["agent"])
from app.routers import describe as describe_router

app.include_router(describe_router.router)
app.include_router(explain.router, prefix="/txns", tags=["explain"])
# charts.router already declares prefix="/charts"; avoid double /charts/charts
app.include_router(charts.router, tags=["charts"])
app.include_router(auth_router.router)
# Commented out old OAuth router - replaced with new Google OAuth below
# app.include_router(auth_oauth_router.router)
app.include_router(
    auth_dev_router.router
)  # Dev PIN unlock (only active in APP_ENV=dev)

# === E2E Test Session ===
app.include_router(e2e_session_router.router)  # Only active when E2E_SESSION_ENABLED=1

# === Google OAuth ===
from app.auth import google as google_auth

app.include_router(google_auth.router)

# === DevDiag Operations ===
from app.routers import ops_diag

app.include_router(ops_diag.router)

# /auth/me endpoint
from fastapi import APIRouter

_auth_me_router = APIRouter()


@_auth_me_router.get("/auth/me")
def get_current_user_endpoint(request: Request):
    """Return current user from JWT token."""
    from app.utils.auth import get_current_user as get_user_from_jwt
    from app.db import get_db

    # Get database session
    db = next(get_db())
    try:
        user = get_user_from_jwt(request, db=db)
        roles = [ur.role.name for ur in user.roles]

        # Derive stable initial on server to prevent flicker
        name = (user.name or "").strip() or None
        email = (user.email or "").strip()
        initial = (name or email or "?")[0].upper()

        # Use picture_url for new Google OAuth photos, fallback to legacy picture field
        picture_url = user.picture if user.picture else None

        return {
            "id": str(user.id),
            "email": email,
            "roles": roles,
            "is_active": user.is_active,
            "name": name,
            "picture": user.picture,  # Legacy field (deprecated, keep for backward compat)
            "picture_url": picture_url,  # New field for Google photos
            "initial": initial,  # Server-derived to prevent client flicker
            "env": os.getenv("APP_ENV", "prod"),
        }
    except HTTPException as e:
        # If JWT auth fails, try session (legacy)
        user_session = request.session.get("user")
        if not user_session:
            raise e
        return {"ok": True, "user": user_session}
    finally:
        db.close()


app.include_router(_auth_me_router)
# === /Google OAuth ===

app.include_router(transactions_router.router)
app.include_router(transactions_nl_router)

# Dev-only helpers (seed endpoints) - never enable in prod
if os.getenv("ALLOW_DEV_ROUTES") == "1":
    app.include_router(dev_router.router)

app.include_router(agent_tools_txn.router)
app.include_router(agent_tools_budget.router)
app.include_router(agent_tools_insights.router)
app.include_router(agent_tools_charts.router)
app.include_router(agent_tools_rules.router)
app.include_router(agent_tools_rules_save.router)
app.include_router(rules_crud_router.router)
app.include_router(rules_apply_all_router.router)
app.include_router(meta_router.router)
app.include_router(agent_tools_suggestions_router.router)
app.include_router(agent_tools_categorize_router.router)
app.include_router(categorize_admin_router.router)
app.include_router(meta.router)
app.include_router(agent_txns.router)  # NEW
app.include_router(agent_plan_router.router)
app.include_router(agent_describe_router.router)  # NEW: contextual help
app.include_router(agent_session_router.router)  # NEW: session management
# Analytics endpoints (agent tools)
app.include_router(analytics.router)
app.include_router(analytics_receiver.router)
app.include_router(analytics_receiver.compat_router)
app.include_router(analytics_events_router.router)
app.include_router(help_ui_router.router)
app.include_router(status_router.router)
app.include_router(live_router.router)
app.include_router(ready_router.router)
from app.routers import help as help_router  # unified help endpoint (what/why)

app.include_router(help_router.router)
app.include_router(txns_edit_router.router)
app.include_router(llm_health_router.router)
app.include_router(dev_overlay_router.router)
app.include_router(llm_echo_router.router)
app.include_router(config_router)  # /config endpoint
app.include_router(metrics_router.router)  # /api/metrics endpoint
app.include_router(admin_router.router)
app.include_router(admin_maintenance_router.router)  # Admin maintenance endpoints

# Optional auth debug router (diagnostics). Enable with ENABLE_AUTH_DEBUG=1 or DEBUG truthy.
try:
    if os.getenv("ENABLE_AUTH_DEBUG", "0").lower() in {"1", "true", "yes", "on"} or str(
        settings.DEBUG
    ).lower() in {"1", "true", "yes", "on"}:
        from app.routers.auth_debug import router as auth_debug_router  # type: ignore

        app.include_router(auth_debug_router)
except Exception:
    pass

# Mount health router at root so /healthz is available at top-level
app.include_router(health_router.router)  # exposes GET /healthz


_STARTUP_TS = int(time.time())  # process start captured once


@app.get("/version")
def version() -> Response:  # pragma: no cover simple
    """Flattened version contract for tests: version, commit, built_at, startup_ts.
    Keeps deterministic content-length by pre-encoding JSON.
    """
    # Prefer build-stamp.json if present to avoid "unknown" values when envs not injected.
    stamp = None
    try:
        import json as _json

        stamp_path = os.path.join(os.path.dirname(__file__), "..", "build-stamp.json")
        stamp_path = os.path.abspath(stamp_path)
        if os.path.isfile(stamp_path):
            with open(stamp_path, "r", encoding="utf-8") as fh:
                stamp = _json.load(fh)
    except Exception:
        stamp = None

    # Prefer explicit APP_VERSION for tests; fall back to branch
    # Prefer explicit environment overrides first
    env_version = (
        os.getenv("APP_VERSION")
        or os.getenv("BACKEND_BRANCH")
        or os.getenv("GIT_BRANCH")
    )
    env_commit = (
        os.getenv("APP_COMMIT")
        or os.getenv("BACKEND_COMMIT")
        or os.getenv("GIT_COMMIT")
    )
    env_build = os.getenv("APP_BUILD_TIME") or os.getenv("BUILD_TIME")

    # Fallbacks from build-stamp.json if present and env not provided
    stamp_version = stamp.get("branch") if stamp else None
    stamp_commit = stamp.get("commit") if stamp else None
    stamp_build = stamp.get("build_time") if stamp else None

    version_branch = env_version or stamp_version or "dev"
    commit_hash = env_commit or stamp_commit or "unknown"
    build_time = env_build or stamp_build or "unknown"

    payload = {
        "version": version_branch,
        "commit": commit_hash,
        "built_at": build_time,
        "startup_ts": _STARTUP_TS,
    }
    body = _dumps(payload)
    try:
        logging.getLogger("uvicorn").info(
            f"/version bytes={len(body)} startup_ts={payload['startup_ts']} commit={payload['commit']}"
        )
    except Exception:
        pass
    return Response(content=body, media_type="application/json")


@app.head("/version")
def version_head() -> Response:  # pragma: no cover simple
    """Lightweight HEAD support so curl -I /version returns 200 rather than 405.
    Body intentionally omitted; clients needing metadata must GET.
    """
    return Response(status_code=200)


@app.get("/version_full")
def version_full() -> Response:
    payload = {
        "app": "LedgerMind",
        "backend": {
            "branch": os.getenv(
                "BACKEND_BRANCH",
                os.getenv("APP_VERSION", os.getenv("GIT_BRANCH", "dev")),
            ),
            "commit": os.getenv(
                "BACKEND_COMMIT",
                os.getenv("APP_COMMIT", os.getenv("GIT_COMMIT", "unknown")),
            ),
            "built_at": os.getenv("APP_BUILD_TIME", os.getenv("BUILD_TIME", "unknown")),
            "startup_ts": _STARTUP_TS,
        },
    }
    return Response(content=_dumps(payload), media_type="application/json")


# Temporary diagnostic endpoint to compare serialization & Content-Length issues.
@app.get("/version2")
def version2():  # pragma: no cover - diagnostics only
    from fastapi.responses import JSONResponse

    payload = {
        "version": os.getenv("APP_VERSION", os.getenv("GIT_BRANCH", "dev")),
        "commit": os.getenv("APP_COMMIT", os.getenv("GIT_COMMIT", "unknown")),
        "built_at": os.getenv("APP_BUILD_TIME", os.getenv("BUILD_TIME", "unknown")),
        "startup_ts": _STARTUP_TS,
    }
    # Explicit serialization to verify byte length
    import json as _json

    body_bytes = _json.dumps(
        payload, separators=(",", ":"), ensure_ascii=False
    ).encode()
    # Log lengths for diagnostics
    try:
        logging.getLogger("uvicorn").info(
            f"/version2 bytes_len={len(body_bytes)} payload={payload}"
        )
    except Exception:
        pass
    return JSONResponse(content=payload)


# Optional: keep simple /health, but wire it to the same status
@app.get("/health")
def health():
    return {"ok": True}


# Debug endpoint to verify proxy headers (TEMPORARY)
@app.get("/_echo")
def echo(request: Request):
    return {
        "url": str(request.url),
        "scheme": request.url.scheme,
        "headers": {
            "host": request.headers.get("host"),
            "x-forwarded-proto": request.headers.get("x-forwarded-proto"),
            "x-forwarded-host": request.headers.get("x-forwarded-host"),
            "x-forwarded-port": request.headers.get("x-forwarded-port"),
            "x-real-ip": request.headers.get("x-real-ip"),
            "x-forwarded-for": request.headers.get("x-forwarded-for"),
            "cookie": (
                request.headers.get("cookie", "")[:100] + "..."
                if len(request.headers.get("cookie", "")) > 100
                else request.headers.get("cookie", "")
            ),
        },
    }


# DB schema verification endpoint
REQUIRED_USER_COLS = {
    "name",
    "picture",
    "email",
    "id",
    "password_hash",
    "is_active",
    "created_at",
}


@app.get("/health/db-schema")
def db_schema_check():
    """Verify critical database schema columns exist to prevent runtime failures."""
    from sqlalchemy import text
    from app.db import get_db

    try:
        db = next(get_db())
        result = db.execute(
            text(
                "SELECT column_name FROM information_schema.columns WHERE table_name='users'"
            )
        )
        cols = {row[0] for row in result}
        missing = sorted(REQUIRED_USER_COLS - cols)

        if missing:
            return JSONResponse(
                status_code=503,
                content={
                    "ok": False,
                    "missing": missing,
                    "error": "Database schema drift detected",
                },
            )

        return {"ok": True, "missing": [], "columns": sorted(cols)}
    except Exception as e:
        return JSONResponse(status_code=503, content={"ok": False, "error": str(e)})
    finally:
        if "db" in locals():
            db.close()


from app.routes import llm_compat as llm_compat_router  # compatibility shim
from app.routers import compat as compat_router  # legacy /api/* compatibility endpoints
from app.observability import metrics_router  # prometheus counters (/metrics)

# After app creation and before other routers registration
app.include_router(llm_compat_router.router)
app.include_router(compat_router.router)
# Include metrics exposition (Instrumentation may already expose /metrics; duplicate path raises)
try:
    # If prometheus_fastapi_instrumentator already registered /metrics we skip
    existing = any(r.path == "/metrics" for r in app.routes)
    if not existing:
        app.include_router(metrics_router)
except Exception:
    pass

# --- Exception Handlers -------------------------------------------------------
try:
    from httpx import ReadTimeout as _HttpxReadTimeout  # type: ignore
except Exception:  # pragma: no cover
    _HttpxReadTimeout = None  # type: ignore
import requests as _requests

if _HttpxReadTimeout is not None:

    @app.exception_handler(_HttpxReadTimeout)  # type: ignore
    async def _on_httpx_read_timeout(
        request, exc
    ):  # pragma: no cover - runtime mapping
        return JSONResponse(
            status_code=503,
            content={
                "error": "upstream_timeout",
                "hint": "LLM backend timed out",
                "kind": "transient",
            },
        )


@app.exception_handler(_requests.exceptions.ConnectTimeout)  # type: ignore
async def _on_requests_connect_timeout(request, exc):  # pragma: no cover
    return JSONResponse(
        status_code=503,
        content={
            "error": "upstream_timeout",
            "hint": "LLM connection timed out",
            "kind": "transient",
        },
    )


@app.exception_handler(_requests.exceptions.ReadTimeout)  # type: ignore
async def _on_requests_read_timeout(request, exc):  # pragma: no cover
    return JSONResponse(
        status_code=503,
        content={
            "error": "upstream_timeout",
            "hint": "LLM read timed out",
            "kind": "transient",
        },
    )
