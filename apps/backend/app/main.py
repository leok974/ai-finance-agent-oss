
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .routers import ingest, txns, rules, ml, report, budget, alerts, insights, agent, explain
from .routers import charts  # NEW
from .routers import health as health_router  # NEW

app = FastAPI(title="AI Finance Agent", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory stores (simple for hackathon; swap to DB later)
app.state.rules = []           # [{pattern, target, category}]
app.state.txns = []            # [{id, date, merchant, description, amount, category}]
app.state.user_labels = []     # [{txn_id, category}]

# Routers
app.include_router(ingest.router, prefix="")
app.include_router(txns.router, prefix="/txns", tags=["txns"])
app.include_router(rules.router, prefix="/rules", tags=["rules"])
app.include_router(ml.router, prefix="/ml", tags=["ml"])
app.include_router(report.router, prefix="", tags=["report"])
app.include_router(budget.router, prefix="/budget", tags=["budget"])
app.include_router(alerts.router, prefix="/alerts", tags=["alerts"])
app.include_router(insights.router, prefix="/insights", tags=["insights"])
app.include_router(agent.router, prefix="/agent", tags=["agent"])
app.include_router(explain.router, prefix="/txns", tags=["explain"])
app.include_router(charts.router, prefix="/charts", tags=["charts"])  # NEW
app.include_router(health_router.router, prefix="/health", tags=["health"])  # NEW



@app.get("/health")
def health():
    return {"ok": True}
