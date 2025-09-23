from fastapi import FastAPI
from contextlib import asynccontextmanager
import asyncio
from .db import Base, engine
from sqlalchemy import inspect
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response
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
from . import config as app_config
from .routers import ingest, txns, rules, ml, report, budget, alerts, insights, agent, explain
from app.routers import analytics
from .routers import meta
from app.routers import agent_tools_transactions as agent_tools_txn
from app.routers import agent_tools_budget as agent_tools_budget
from app.routers import agent_tools_insights as agent_tools_insights
from app.routers import agent_tools_charts as agent_tools_charts
from app.routers import agent_tools_rules as agent_tools_rules
from app.routers import agent_tools_rules_save as agent_tools_rules_save  # new save endpoint
from app.routers import agent_tools_rules_crud as rules_crud_router
from app.routers import agent_tools_rules_apply_all as rules_apply_all_router
from app.routers import agent_tools_meta as meta_router
from .routers import charts
from app.routers import txns_edit as txns_edit_router
from app.routers import auth as auth_router
from app.routers import auth_oauth as auth_oauth_router
from app.routers import agent_txns  # NEW
from app.routers import help_ui as help_ui_router
from .routers import transactions as transactions_router
from app.routers.transactions_nl import router as transactions_nl_router
from .routers import dev as dev_router
from .routers import health as health_router
from .routers import agent_plan as agent_plan_router
from .utils.state import load_state, save_state
import logging
import subprocess
from app.services.crypto import EnvelopeCrypto
from app.core.crypto_state import set_crypto, set_active_label
from sqlalchemy.orm import Session
from app.db import SessionLocal
from app.core.crypto_state import load_and_cache_active_dek
import base64
from app.middleware.request_logging import RequestLogMiddleware
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

# Print git info on boot
try:
    b = subprocess.check_output(["git","rev-parse","--abbrev-ref","HEAD"]).decode().strip()
    s = subprocess.check_output(["git","rev-parse","--short","HEAD"]).decode().strip()
    logging.getLogger("uvicorn").info(f"Backend booting from {b}@{s}")
except Exception:
    pass

# Enable JSON logs in production
try:
    if os.environ.get("APP_ENV", os.environ.get("ENV", "dev")).lower() == "prod":
        from app.logging import configure_json_logging
        configure_json_logging("INFO")
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
        trusted = cidrs or ips or ["172.16.0.0/12"]  # fallback to Docker private range if unset
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
            for o in [s.strip().strip('"').strip("'") for s in cors_env.split(",") if s.strip()]:
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

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOW_ORIGINS,  # Keep tight in prod via env
    allow_credentials=True,
    allow_methods=["GET","POST","PUT","PATCH","DELETE","OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-CSRF-Token"],
    expose_headers=["Content-Disposition"],
)


class SecurityHeaders(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        resp: Response = await call_next(request)
        resp.headers.setdefault("X-Content-Type-Options", "nosniff")
        resp.headers.setdefault("X-Frame-Options", "DENY")
        resp.headers.setdefault("Referrer-Policy", "no-referrer")
        resp.headers.setdefault("Permissions-Policy", "geolocation=(), microphone=(), camera=()")
        # Prefer HSTS at the TLS proxy; set here for completeness
        resp.headers.setdefault("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload")
        return resp

app.add_middleware(SecurityHeaders)

# Optional: Prometheus metrics (disable if not needed)
try:
    from prometheus_fastapi_instrumentator import Instrumentator
    Instrumentator().instrument(app).expose(app, endpoint="/metrics", include_in_schema=False)
except Exception:
    pass

# Session storage (used by OAuth state/nonce)
app.add_middleware(
    SessionMiddleware,
    secret_key=os.environ.get("OAUTH_SESSION_SECRET", os.environ.get("AUTH_SECRET", "change-me")),
    same_site=os.environ.get("COOKIE_SAMESITE", "lax"),
)

# CSRF is attached per-route on unsafe endpoints only (see routers)

# Legacy in-memory stores (kept for compatibility; safe to remove if unused)
app.state.rules = []
app.state.txns = []
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
async def _startup_load_state():
    try:
        load_state(app)
        logger.info("state: loaded OK")
    except Exception as e:
        logger.warning("state: load failed, continuing startup", exc_info=e)
        if os.getenv("STARTUP_STATE_STRICT", "0").lower() in {"1", "true", "yes"}:
            raise
    try:
        enabled = os.environ.get("ENCRYPTION_ENABLED", "1") == "1"
        if enabled:
            crypto = EnvelopeCrypto.from_env(os.environ)
            set_crypto(crypto)
            label = os.environ.get("ENCRYPTION_ACTIVE_LABEL", "active")
            set_active_label(label)
            with _session_scope() as db:
                load_and_cache_active_dek(db)
                # Active label age warning (optional)
                try:
                    threshold_days = int(os.environ.get("CRYPTO_ACTIVE_AGE_WARN_DAYS", "90"))
                    row = db.execute(text("SELECT created_at FROM encryption_keys WHERE label='active' ORDER BY created_at DESC LIMIT 1")).first()
                    if row and getattr(row, "created_at", None):
                        created = row.created_at
                        if not isinstance(created, datetime):
                            created = datetime.fromisoformat(str(created))
                        age_days = (datetime.now(timezone.utc) - created.replace(tzinfo=timezone.utc)).days
                        if age_days >= threshold_days:
                            logging.getLogger("uvicorn").info("crypto: active label age=%sd exceeds threshold=%sd (label rotation recommended)", age_days, threshold_days)
                except Exception:
                    pass
                if os.environ.get("APP_ENV", "dev").lower() == "prod":
                    from app.core.crypto_state import get_crypto_status as _crypto_status
                    st = _crypto_status(db)
                    if not st.get("ready"):
                        logging.getLogger("uvicorn").error("Crypto NOT ready at startup: %s", st)
                        import sys
                        sys.exit(1)
            logging.getLogger("uvicorn").info("crypto: initialized (DEK cached)")
    except Exception as e:
        logging.getLogger("uvicorn").error("crypto init failed: %s", e)
        if os.environ.get("APP_ENV", os.environ.get("ENV", "dev")).lower() == "prod":
            import sys
            sys.exit(1)

async def _shutdown_save_state():
    save_state(app)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup sequence
    _create_tables_dev()
    await _startup_load_state()
    app.state._bg_tasks = []
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

# Attach lifespan
app.router.lifespan_context = lifespan

# Routers
app.include_router(ingest.router, prefix="")
app.include_router(txns.router, prefix="/txns", tags=["txns"])
app.include_router(rules.router)
app.include_router(ml.router)
app.include_router(report.router, prefix="", tags=["report"])
app.include_router(budget.router, prefix="/budget", tags=["budget"])
# Also mount /budgets for temp overlay endpoints
try:
    app.include_router(budget.temp_router)
except Exception:
    pass
app.include_router(alerts.router, prefix="/alerts", tags=["alerts"])
app.include_router(insights.router)
app.include_router(agent.router, prefix="/agent", tags=["agent"])
app.include_router(explain.router, prefix="/txns", tags=["explain"])
app.include_router(charts.router, prefix="/charts", tags=["charts"]) 
app.include_router(auth_router.router)
app.include_router(auth_oauth_router.router)
app.include_router(transactions_router.router)
app.include_router(transactions_nl_router)
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
app.include_router(meta.router)
app.include_router(agent_txns.router)  # NEW
app.include_router(agent_plan_router.router)
# Analytics endpoints (agent tools)
app.include_router(analytics.router)
app.include_router(help_ui_router.router)
app.include_router(txns_edit_router.router)

# Mount health router at root so /healthz is available at top-level
app.include_router(health_router.router)  # exposes GET /healthz



# Optional: keep simple /health, but wire it to the same status
@app.get("/health")
def health():
    return {"ok": True}
