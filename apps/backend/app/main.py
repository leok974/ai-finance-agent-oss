from fastapi import FastAPI
from .db import Base, engine
from sqlalchemy import inspect
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware
import os
from .routers import ingest, txns, rules, ml, report, budget, alerts, insights, agent, explain
from .routers import meta
from app.routers import agent_tools_transactions as agent_tools_txn
from app.routers import agent_tools_budget as agent_tools_budget
from app.routers import agent_tools_insights as agent_tools_insights
from app.routers import agent_tools_charts as agent_tools_charts
from app.routers import agent_tools_rules as agent_tools_rules
from app.routers import agent_tools_rules_crud as rules_crud_router
from app.routers import agent_tools_rules_apply_all as rules_apply_all_router
from app.routers import agent_tools_meta as meta_router
from .routers import charts
from app.routers import auth as auth_router
from app.routers import auth_oauth as auth_oauth_router
from app.routers import agent_txns  # NEW
from .routers import transactions as transactions_router
from .routers import dev as dev_router
from .routers import health as health_router
from .utils.state import load_state, save_state
import logging
import subprocess

# Print git info on boot
try:
    b = subprocess.check_output(["git","rev-parse","--abbrev-ref","HEAD"]).decode().strip()
    s = subprocess.check_output(["git","rev-parse","--short","HEAD"]).decode().strip()
    logging.getLogger("uvicorn").info(f"Backend booting from {b}@{s}")
except Exception:
    pass

app = FastAPI(
    title="AI Finance Agent",
    version="0.1.0",
    openapi_url="/openapi.json",
    docs_url="/docs",
    redoc_url="/redoc",
)

@app.get("/ping")
def root_ping():
    return {"ok": True}

@app.on_event("startup")
def _create_tables_dev():
    # Dev convenience for SQLite; guard to avoid conflicts with Alembic
    try:
        if engine.url.get_backend_name().startswith("sqlite"):
            insp = inspect(engine)
            if "alembic_version" not in insp.get_table_names():
                Base.metadata.create_all(bind=engine)
    except Exception:
        # Ignore in dev if engine misconfigured
        pass

# Allow Vite dev origins explicitly (browser CORS) and expose filename header
DEV_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]

# In production, prefer explicit allowlist via CORS_ALLOW_ORIGINS env (comma-separated)
origins_env = os.environ.get("CORS_ALLOW_ORIGINS")
ALLOW_ORIGINS = [o.strip() for o in origins_env.split(",") if o.strip()] if origins_env else DEV_ORIGINS

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOW_ORIGINS,   # In dev, defaults to both hosts used by the web app
    allow_credentials=True,      # enable cookies
    allow_methods=["*"],
    allow_headers=["Authorization", "Content-Type", "X-CSRF-Token"],
    expose_headers=["Content-Disposition"],  # allow frontend to read filename
)

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
@app.on_event("startup")
async def _startup_load_state():
    load_state(app)

@app.on_event("shutdown")
async def _shutdown_save_state():
    save_state(app)

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
app.include_router(dev_router.router)
app.include_router(agent_tools_txn.router)
app.include_router(agent_tools_budget.router)
app.include_router(agent_tools_insights.router)
app.include_router(agent_tools_charts.router)
app.include_router(agent_tools_rules.router)
app.include_router(rules_crud_router.router)
app.include_router(rules_apply_all_router.router)
app.include_router(meta_router.router)
app.include_router(meta.router)
app.include_router(agent_txns.router)  # NEW

# Mount health router at root so /healthz is available at top-level
app.include_router(health_router.router)  # exposes GET /healthz



# Optional: keep simple /health, but wire it to the same status
@app.get("/health")
def health():
    return {"ok": True}
