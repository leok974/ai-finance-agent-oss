
from fastapi import FastAPI
from .db import Base, engine
from sqlalchemy import inspect
from fastapi.middleware.cors import CORSMiddleware
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

app = FastAPI(title="AI Finance Agent", version="0.1.0")

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

# Allow Vite dev origins explicitly (browser CORS)
origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,         # required if cookies/auth are used
    allow_methods=["*"],            # allow all methods in dev
    allow_headers=["*"],            # allow all headers in dev
)

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
app.include_router(alerts.router, prefix="/alerts", tags=["alerts"])
app.include_router(insights.router, prefix="/insights", tags=["insights"])
app.include_router(agent.router, prefix="/agent", tags=["agent"])
app.include_router(explain.router, prefix="/txns", tags=["explain"])
app.include_router(charts.router, prefix="/charts", tags=["charts"]) 
app.include_router(agent_tools_txn.router)
app.include_router(agent_tools_budget.router)
app.include_router(agent_tools_insights.router)
app.include_router(agent_tools_charts.router)
app.include_router(agent_tools_rules.router)
app.include_router(rules_crud_router.router)
app.include_router(rules_apply_all_router.router)
app.include_router(meta_router.router)
app.include_router(meta.router)

# Mount health router at root so /healthz is available at top-level
app.include_router(health_router.router)  # exposes GET /healthz



# Optional: keep simple /health, but wire it to the same status
@app.get("/health")
def health():
    return {"ok": True}
