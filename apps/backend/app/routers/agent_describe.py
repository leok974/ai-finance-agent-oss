"""
Agent Describe Router

Provides contextual explanations ("What/Why/Actions") for dashboard panels.
Supports both GET (deterministic heuristics) and POST (LLM-generated rephrase).
"""
from fastapi import APIRouter, Depends, Query, HTTPException, Body
from sqlalchemy.orm import Session
from typing import Dict, Any, List

from app.db import get_db
from app.services.explain import (
    explain_month_merchants,
    explain_month_categories,
    explain_daily_flows,
    explain_month_anomalies,
    explain_insights_overview,
)
from app.utils.cache import cache_get, cache_set, cache_clear

# Import metrics if available
try:
    from app.metrics_ml import lm_help_requests_total
    METRICS_AVAILABLE = True
except ImportError:
    METRICS_AVAILABLE = False

router = APIRouter(prefix="/agent/describe", tags=["agent.describe"])


def _validate_month_or_422(month: str):
    """
    Validate month is in YYYY-MM format with month in 1-12 range.
    
    Raises:
        HTTPException(422): If month is invalid
    """
    try:
        year, month_num = map(int, month.split("-"))
        if not (1 <= month_num <= 12):
            raise HTTPException(
                status_code=422,
                detail=f"Month must be between 1 and 12, got {month_num}"
            )
    except (ValueError, AttributeError):
        raise HTTPException(
            status_code=422,
            detail=f"Invalid month format: {month}. Expected YYYY-MM"
        )


@router.get("/_selftest")
def selftest(
    month: str = Query("2025-11", regex=r"^\d{4}-\d{2}$", description="Month to test"),
    db: Session = Depends(get_db),
):
    """
    Fast selftest endpoint for CI/pre-commit validation.
    
    Tests all 5 help panels quickly and returns pass/fail status.
    
    Args:
        month: Month in YYYY-MM format (defaults to 2025-11)
        db: Database session
        
    Returns:
        {
            "month": str,
            "ok": {panel_id: bool},
            "all_ok": bool,
            "errors": {panel_id: str}  # Only present if errors occurred
        }
    """
    _validate_month_or_422(month)
    
    panels = [
        ("charts.month_merchants", explain_month_merchants),
        ("charts.month_categories", explain_month_categories),
        ("charts.daily_flows", explain_daily_flows),
        ("charts.month_anomalies", explain_month_anomalies),
        ("charts.insights_overview", explain_insights_overview),
    ]
    
    ok_status = {}
    errors = {}
    
    for panel_id, explainer_fn in panels:
        try:
            result = explainer_fn(db, month)
            # Panel passes if it returns a non-empty "why" field
            has_why = bool(result.get("why", "").strip())
            ok_status[panel_id] = has_why
            if not has_why:
                errors[panel_id] = "Empty 'why' field"
        except Exception as e:
            ok_status[panel_id] = False
            errors[panel_id] = str(e)
    
    response = {
        "month": month,
        "ok": ok_status,
        "all_ok": all(ok_status.values()),
    }
    
    if errors:
        response["errors"] = errors
    
    return response


@router.post("/_cache/clear")
def clear_cache(
    prefix: str = Query("help:", description="Cache key prefix to clear"),
):
    """
    Clear cached help entries (dev/admin endpoint).
    
    Useful for:
    - Testing prompt changes without waiting for TTL expiry
    - Forcing fresh RAG queries
    - Debugging cache behavior
    
    Args:
        prefix: Cache key prefix (defaults to "help:")
        
    Returns:
        {
            "prefix": str,
            "message": str
        }
        
    Example:
        POST /agent/describe/_cache/clear?prefix=help:
        POST /agent/describe/_cache/clear?prefix=help:charts.month_merchants
    """
    cache_clear(prefix=prefix)
    
    return {
        "prefix": prefix,
        "message": f"Cache entries matching '{prefix}*' cleared successfully"
    }


@router.get("/{panel_id}")
def describe_panel(
    panel_id: str,
    month: str = Query(..., regex=r"^\d{4}-\d{2}$", description="Month in YYYY-MM format"),
    refresh: bool = Query(False, description="Skip cache (admin only)"),
    db: Session = Depends(get_db),
):
    """
    Get contextual explanation for a dashboard panel.
    
    Args:
        panel_id: Panel identifier (e.g., "charts.month_merchants")
        month: Month in YYYY-MM format
        refresh: Skip cache if true (for admin debugging)
        db: Database session
        
    Returns:
        {
            "title": str,
            "what": str,  # Data summary
            "why": str,   # Insights/drivers
            "insights": List[Dict],  # Raw data
            "actions": List[str],  # Recommendations
        }
        
    Raises:
        HTTPException: 404 if panel_id is not recognized
        HTTPException: 422 if month is invalid
    """
    # Validate month range
    _validate_month_or_422(month)
    
    # Check cache first (unless refresh requested)
    cache_key = f"help:{panel_id}:{month}"
    if not refresh:
        cached = cache_get(cache_key)
        if cached:
            if METRICS_AVAILABLE:
                lm_help_requests_total.labels(panel_id=panel_id, cache="hit").inc()
            return cached
    
    # Track cache miss (or refresh)
    if METRICS_AVAILABLE:
        lm_help_requests_total.labels(panel_id=panel_id, cache="miss" if not refresh else "refresh").inc()
    
    # Route to appropriate explainer
    if panel_id == "charts.month_merchants":
        data = explain_month_merchants(db, month)
    elif panel_id == "charts.month_categories":
        data = explain_month_categories(db, month)
    elif panel_id == "charts.daily_flows":
        data = explain_daily_flows(db, month)
    elif panel_id == "charts.month_anomalies":
        data = explain_month_anomalies(db, month)
    elif panel_id == "charts.insights_overview":
        data = explain_insights_overview(db, month)
    else:
        raise HTTPException(
            status_code=404,
            detail=f"Unknown panel_id: {panel_id}. Supported: charts.month_merchants, charts.month_categories, charts.daily_flows, charts.month_anomalies, charts.insights_overview"
        )
    
    # Enhanced no-data handling
    if not data.get("insights") or (isinstance(data.get("insights"), list) and len(data["insights"]) == 0):
        # Check if it's truly no data
        what = data.get("what", "")
        if "Txns=0" in what or "No significant spending" in what:
            data["why"] = f"No transactions found for {month}. Upload a CSV or check date filters."
            data["actions"] = [
                "Upload transactions via the import page",
                "Verify date range includes this month",
                "Check if transactions were successfully processed"
            ]
    
    cache_set(cache_key, data)
    return data


@router.post("/{panel_id}")
async def describe_panel_post(
    panel_id: str,
    payload: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
):
    """
    POST endpoint for LLM-generated explanations (Why tab with rephrase=true).
    
    Request body:
        {
            "card_id": str,
            "month": str (optional),
            "rephrase": bool (optional),
            "ctx": dict (optional)
        }
        
    Returns:
        {
            "explain": str,  # Combined What+Why explanation
            "sources": List[Dict],
            "reasons": List[str],  # ["rag", "llm", "heuristic"]
            "grounded": bool  # True if RAG/LLM was used
        }
        
    Falls back to heuristic explanation if LLM unavailable.
    """
    # Track metrics
    if METRICS_AVAILABLE:
        lm_help_requests_total.labels(panel_id=panel_id, cache="miss").inc()
    
    month = payload.get("month")
    rephrase = payload.get("rephrase", False)
    
    # Route to appropriate explainer
    if panel_id in ["charts.month_merchants", "charts.month_categories", "charts.daily_flows", 
                    "charts.month_anomalies", "charts.insights_overview"] and month:
        # Map panel_id to explainer function
        explainer_map = {
            "charts.month_merchants": explain_month_merchants,
            "charts.month_categories": explain_month_categories,
            "charts.daily_flows": explain_daily_flows,
            "charts.month_anomalies": explain_month_anomalies,
            "charts.insights_overview": explain_insights_overview,
        }
        
        result = explainer_map[panel_id](db, month)
        
        # Combine what + why for the explanation field
        explain_parts = []
        if result.get("what"):
            explain_parts.append(result["what"])
        if result.get("why"):
            explain_parts.append(result["why"])
        
        explain_text = " ".join(explain_parts) if explain_parts else "Analysis pending."
        
        return {
            "explain": explain_text,
            "sources": [],
            "reasons": result.get("reasons", ["heuristic"]),
            "grounded": result.get("grounded", False),
        }
    
    # Fallback for unknown panels or missing month
    return {
        "explain": "This panel shows financial data. For detailed analysis, try the 'What' tab for structured insights.",
        "sources": [],
        "reasons": ["fallback"],
        "grounded": False,
    }
