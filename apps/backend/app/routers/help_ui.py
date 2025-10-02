from __future__ import annotations

from fastapi import APIRouter, Body, Depends
from sqlalchemy.orm import Session

from app.db import get_db
from app.services.ui_help import UI_HELP
from app.services import charts_data as charts_svc
from app.services import analytics as analytics_svc

# Accept alternate/legacy keys and map them to canonical ones
ALIASES = {
    "cards.month_summary": "cards.overview",
    "charts.month_categories": "charts.top_categories",
    "charts.categories": "charts.top_categories",
    "charts.daily": "charts.daily_flows",
}

router = APIRouter(prefix="/agent/tools/help/ui", tags=["help"])


@router.post("/describe")
def describe(payload: dict = Body(...), db: Session = Depends(get_db)):
    key = (payload.get("key") or "").strip()
    orig_key = key
    with_context = bool(payload.get("with_context", False))
    month = payload.get("month")

    if not key:
        canonical_keys = sorted(k for k in UI_HELP.keys() if k not in ALIASES)
        return {"keys": canonical_keys}

    if with_context:
        lookup_key = ALIASES.get(key, key)  # resolve for content but echo original
        resp_key = key
    else:
        key = ALIASES.get(key, key)  # mutate to canonical for non-context
        lookup_key = key
        resp_key = key
    base = UI_HELP.get(lookup_key)
    if not base:
        return {"key": key, "help": None}

    out = {"key": resp_key, "help": base}

    if with_context:
        ctx = {}
        try:
            if lookup_key == "charts.month_merchants":
                if not month:
                    # try to infer latest month for context
                    from app.services.charts_data import latest_month_str
                    month = latest_month_str(db)
                if month:
                    ctx["data"] = charts_svc.get_month_merchants(db, month)
            elif lookup_key == "charts.top_categories":
                if not month:
                    from app.services.charts_data import latest_month_str
                    month = latest_month_str(db)
                if month:
                    ctx["data"] = charts_svc.get_month_categories(db, month)
            elif lookup_key == "charts.month_flows":
                if not month:
                    from app.services.charts_data import latest_month_str
                    month = latest_month_str(db)
                if month:
                    ctx["data"] = charts_svc.get_month_flows(db, month)
            elif lookup_key == "charts.daily_flows":
                if not month:
                    from app.services.charts_data import latest_month_str
                    month = latest_month_str(db)
                if month:
                    ctx["data"] = charts_svc.get_month_flows(db, month)
            elif lookup_key == "charts.spending_trends":
                ctx["data"] = charts_svc.get_spending_trends(db, months=6)
            elif lookup_key == "cards.month_summary" or lookup_key == "cards.overview":
                ctx["data"] = analytics_svc.compute_kpis(db, month=month, lookback=6)
            # add more as needed
        except Exception as e:
            ctx["error"] = str(e)
        out["context"] = ctx

    return out
