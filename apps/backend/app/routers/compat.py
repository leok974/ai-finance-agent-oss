from fastapi import APIRouter, Query, Request, Depends
from fastapi.responses import JSONResponse
import os
from app.db import get_db
from typing import Any, Dict
from app.observability import compat_hits

router = APIRouter(prefix="/api", tags=["compat"])

NEW = {
    "/api/charts/month-summary": "/charts/month-summary",
    "/api/charts/month-merchants": "/charts/month-merchants",
    "/api/charts/month-flows": "/charts/month-flows",
    "/api/charts/spending-trends": "/charts/spending-trends",
    "/api/rules": "/rules",
    "/api/rules/suggestions": "/rules/suggestions",
    "/api/rules/suggestions/persistent": "/rules/suggestions/persistent",
    "/api/rules/config": "/rules/config",
    "/api/rules/persistent": "/rules/persistent",
    "/api/suggestions": "/suggestions",
    "/api/config": "/config",
    "/api/models": "/models",
}

_SUNSET = "Wed, 31 Dec 2025 23:59:59 GMT"


def _json(request: Request, path: str, payload: Dict[str, Any]) -> JSONResponse:
    source = "probe" if request.query_params.get("probe") == "1" else "client"
    compat_hits.labels(path=path, source=source).inc()
    return JSONResponse(
        payload,
        headers={
            "Deprecation": "true",
            "Link": f'<{NEW.get(path, "/")}>; rel="alternate"',
            "Sunset": _SUNSET,
        },
    )


# ---- Charts ----
@router.get("/charts/month-summary")
def charts_month_summary(request: Request):
    return _json(
        request,
        "/api/charts/month-summary",
        {"summary": [], "range": {"start": None, "end": None}},
    )


@router.get("/charts/month-merchants")
def charts_month_merchants(request: Request):
    return _json(request, "/api/charts/month-merchants", {"merchants": []})


@router.get("/charts/month-flows")
def charts_month_flows(request: Request):
    return _json(request, "/api/charts/month-flows", {"inflows": [], "outflows": []})


@router.get("/charts/spending-trends")
def charts_spending_trends(request: Request, months: int = Query(6, ge=1, le=36)):
    return _json(
        request, "/api/charts/spending-trends", {"months": months, "series": []}
    )


# ---- Rules & Suggestions ----
@router.get("/rules")
def rules_list(request: Request, limit: int = 20, offset: int = 0):
    return _json(
        request,
        "/api/rules",
        {"items": [], "total": 0, "limit": limit, "offset": offset},
    )


@router.get("/rules/suggestions")
def rules_suggestions(request: Request):
    return _json(request, "/api/rules/suggestions", {"suggestions": []})


SUGGESTIONS_ENABLED = os.getenv("SUGGESTIONS_ENABLED", "0") in (
    "1",
    "true",
    "True",
    "yes",
)


@router.get("/rules/suggestions/persistent")
def rules_suggestions_persistent(request: Request, db=Depends(get_db)):
    if not SUGGESTIONS_ENABLED:
        return _json(request, "/api/rules/suggestions/persistent", {"items": []})
    from .agent_tools_suggestions import (
        SuggestionsRequest,
        compute_suggestions,
    )  # lazy import

    body = SuggestionsRequest()
    resp = compute_suggestions(body, db)
    return JSONResponse(resp.dict())


# Catch-all for any other legacy suggestions subpaths (preview, mine, etc.) to avoid DB usage.
@router.api_route(
    "/rules/suggestions/{_rest:path}",
    methods=["GET", "POST", "PUT", "DELETE", "PATCH"],
    include_in_schema=False,
)
def rules_suggestions_catch_all(
    request: Request, _rest: str
):  # pragma: no cover - simple shim
    return _json(request, f"/api/rules/suggestions/{_rest}", {"items": []})


@router.get("/rules/config")
def rules_config(request: Request):
    return _json(
        request, "/api/rules/config", {"enabled": True, "thresholds": {}, "version": 1}
    )


@router.get("/rules/persistent")
def rules_persistent(request: Request):
    return _json(request, "/api/rules/persistent", {"items": []})


# Some builds call /api/suggestions (not /rules/suggestions)
@router.get("/suggestions")
def suggestions_compat(
    request: Request, window_days: int = 60, min_count: int = 3, max_results: int = 25
):
    return _json(
        request,
        "/api/suggestions",
        {"window_days": window_days, "min_count": min_count, "items": []},
    )


# ---- Misc used by the UI ----
@router.get("/config")
def ui_config(request: Request):
    return _json(
        request,
        "/api/config",
        {"branding": "LedgerMind", "features": {"upload": True, "charts": True}},
    )


@router.get("/models")
def models_list(request: Request):
    return _json(request, "/api/models", {"models": []})
