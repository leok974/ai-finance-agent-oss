# apps/backend/app/services/agent_tools.py
from typing import Dict, Any, Optional
from .rules_engine import apply_rules
from collections import defaultdict
import json
import re
from sqlalchemy.orm import Session

# New imports for deterministic tool routing
from app.services.txns_nl_query import parse_nl_query, run_txn_query
from app.services.agent_detect import detect_txn_query
from app.services.charts_data import (
    latest_month_str,
    get_month_summary,
    get_month_flows,
    get_month_merchants,
    get_month_categories,
)
from app.services.budget_recommend import compute_recommendations
from app.services.agent_detect import detect_budget_recommendation, extract_months_or_default, Detector
from app.utils.state import TEMP_BUDGETS, ANOMALY_IGNORES, current_month_key
from app.services.charts_data import get_category_timeseries
from app.services.insights_anomalies import compute_anomalies

def tool_specs():
    return [
        {
            "type": "function",
            "function": {
                "name": "categorize_txn",
                "description": "Assign a category to a transaction by id.",
                "parameters": {
                    "type": "object",
                    "properties": { 
                        "txn_id": {"type":"integer"}, 
                        "category": {"type":"string"} 
                    },
                    "required": ["txn_id","category"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "get_spending_summary",
                "description": "Get spending summary for a specific month or date range.",
                "parameters": {
                    "type": "object",
                    "properties": { 
                        "month": {"type":"string", "description": "YYYY-MM format"},
                        "category": {"type":"string", "description": "Optional category filter"}
                    },
                    "required": ["month"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "find_transactions",
                "description": "Search for transactions by merchant, description, or amount range.",
                "parameters": {
                    "type": "object",
                    "properties": { 
                        "merchant": {"type":"string", "description": "Merchant name to search for"},
                        "description": {"type":"string", "description": "Description text to search for"},
                        "min_amount": {"type":"number", "description": "Minimum amount"},
                        "max_amount": {"type":"number", "description": "Maximum amount"},
                        "category": {"type":"string", "description": "Category to filter by"},
                        "month": {"type":"string", "description": "YYYY-MM format"}
                    }
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "budget_analysis",
                "description": "Analyze budget performance for a month.",
                "parameters": {
                    "type": "object",
                    "properties": { "month": {"type":"string"} },
                    "required": ["month"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "spending_trends",
                "description": "Get spending trends over multiple months.",
                "parameters": {
                    "type": "object",
                    "properties": { 
                        "months": {"type":"integer", "description": "Number of months to analyze"},
                        "category": {"type":"string", "description": "Optional category to focus on"}
                    }
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "create_budget_rule",
                "description": "Create a budget limit for a category.",
                "parameters": {
                    "type": "object",
                    "properties": { 
                        "category": {"type":"string"}, 
                        "limit": {"type":"number"},
                        "period": {"type":"string", "enum": ["monthly", "weekly"], "default": "monthly"}
                    },
                    "required": ["category", "limit"]
                }
            }
        }
    ]

def call_tool(name: str, args: Dict[str, Any]):
    from ..main import app
    
    if name == "categorize_txn":
        tid = int(args["txn_id"])
        cat = str(args["category"])
        for t in app.state.txns:
            if t["id"] == tid:
                t["category"] = cat
                return {"ok": True, "message": f"Categorized transaction {tid} as {cat}"}
        return {"ok": False, "error": "Transaction not found"}

    elif name == "get_spending_summary":
        month = args["month"]
        category_filter = args.get("category")
        
        month_txns = [t for t in app.state.txns if t["date"].startswith(month)]
        if category_filter:
            month_txns = [t for t in month_txns if t.get("category") == category_filter]
        
        total_spent = sum(abs(float(t["amount"])) for t in month_txns if float(t["amount"]) < 0)
        total_income = sum(float(t["amount"]) for t in month_txns if float(t["amount"]) > 0)
        
        categories = defaultdict(float)
        for t in month_txns:
            if float(t["amount"]) < 0:
                cat = t.get("category", "Unknown")
                categories[cat] += abs(float(t["amount"]))
        
        return {
            "month": month,
            "total_spent": round(total_spent, 2),
            "total_income": round(total_income, 2),
            "net": round(total_income - total_spent, 2),
            "categories": dict(categories),
            "transaction_count": len(month_txns)
        }

    elif name == "find_transactions":
        merchant = args.get("merchant", "").lower()
        description = args.get("description", "").lower()
        min_amount = args.get("min_amount")
        max_amount = args.get("max_amount")
        category = args.get("category")
        month = args.get("month")
        
        results = []
        for t in app.state.txns:
            # Apply filters
            if month and not t["date"].startswith(month):
                continue
            if merchant and merchant not in (t.get("merchant", "").lower()):
                continue
            if description and description not in (t.get("description", "").lower()):
                continue
            if category and t.get("category") != category:
                continue
            
            amount = float(t["amount"])
            if min_amount is not None and amount < min_amount:
                continue
            if max_amount is not None and amount > max_amount:
                continue
            
            results.append({
                "id": t["id"],
                "date": t["date"],
                "merchant": t.get("merchant", ""),
                "description": t.get("description", ""),
                "amount": amount,
                "category": t.get("category", "Unknown")
            })
        
        return {
            "found": len(results),
            "transactions": results[:20]  # Limit to first 20
        }

    elif name == "budget_analysis":
        month = args["month"]
        from ..routers.budget import budget_check
        budget_data = budget_check(month)
        
        total_overspend = sum(r["over"] for r in budget_data)
        categories_over = [r["category"] for r in budget_data if r["over"] > 0]
        
        return {
            "month": month,
            "budget_items": budget_data,
            "total_overspend": round(total_overspend, 2),
            "categories_over_budget": categories_over,
            "budget_health": "Good" if total_overspend == 0 else "Needs Attention"
        }

    elif name == "spending_trends":
        import datetime as dt
        months = args.get("months", 6)
        category_filter = args.get("category")
        
        # Get available months using proper date parsing
        all_months = set()
        for t in app.state.txns:
            date_str = t.get("date", "")
            if date_str:
                try:
                    date_obj = dt.date.fromisoformat(date_str[:10])
                    all_months.add(date_obj.strftime("%Y-%m"))
                except (ValueError, TypeError):
                    # Fallback to string slicing for malformed dates
                    if len(date_str) >= 7:
                        all_months.add(date_str[:7])
        
        all_months = sorted(all_months)
        recent_months = all_months[-months:] if len(all_months) > months else all_months
        
        trends = []
        for month in recent_months:
            month_txns = []
            for t in app.state.txns:
                date_str = t.get("date", "")
                if date_str:
                    try:
                        date_obj = dt.date.fromisoformat(date_str[:10])
                        if date_obj.strftime("%Y-%m") == month:
                            month_txns.append(t)
                    except (ValueError, TypeError):
                        # Fallback to string prefix matching for malformed dates
                        if date_str.startswith(month):
                            month_txns.append(t)
            
            if category_filter:
                month_txns = [t for t in month_txns if t.get("category") == category_filter]
            
            spent = sum(abs(float(t["amount"])) for t in month_txns if float(t["amount"]) < 0)
            trends.append({"month": month, "spent": round(spent, 2)})
        
        # Calculate trend direction
        if len(trends) >= 2:
            recent_avg = sum(t["spent"] for t in trends[-2:]) / 2
            older_avg = sum(t["spent"] for t in trends[:-2]) / max(1, len(trends) - 2)
            trend_direction = "increasing" if recent_avg > older_avg else "decreasing"
        else:
            trend_direction = "stable"
        
        return {
            "category": category_filter or "all",
            "trends": trends,
            "trend_direction": trend_direction,
            "avg_monthly": round(sum(t["spent"] for t in trends) / len(trends), 2) if trends else 0
        }

    elif name == "create_budget_rule":
        category = args["category"]
        limit = args["limit"]
        period = args.get("period", "monthly")
        
        # Store budget rules (in a real app, this would go to database)
        if not hasattr(app.state, 'budget_rules'):
            app.state.budget_rules = {}
        
        app.state.budget_rules[category] = {
            "limit": limit,
            "period": period
        }
        
        return {
            "ok": True,
            "message": f"Created {period} budget of ${limit} for {category}"
        }

    return {"ok": False, "error": "Unknown tool"}


# --------- Deterministic router for chat short-circuit ---------------------------------

def _extract_month(text: str) -> Optional[str]:
    """Try to infer a month (YYYY-MM) from natural text like 'in August 2025'."""
    m = re.search(r"in\s+([A-Za-z]+)\s*(\d{4})?", text, re.IGNORECASE)
    if not m:
        return None
    try:
        from datetime import datetime
        month_name = m.group(1).title()
        year = int(m.group(2)) if m.group(2) else datetime.now().year
        month_num = datetime.strptime(month_name, "%B").month
        return f"{year:04d}-{month_num:02d}"
    except Exception:
        return None


def route_to_tool(user_text: str, db: Session) -> Optional[Dict[str, Any]]:
    """
    Returns a dict with:
      - mode: one of ["nl_txns", "charts.summary", "charts.flows", "charts.merchants", "charts.categories", "report.link", "budgets.read"]
      - filters: resolved filters (month and/or start/end)
      - result: tool result payload (shape depends on tool)
      - url/meta: for links (reports)
    Or None to indicate fallback to LLM.
    """
    text_low = user_text.lower()

    # 1) Explicit anomalies ignore — highest precedence among insights
    det = Detector()
    if det.detect_anomaly_ignore(user_text):
        ap = det.extract_anomaly_ignore_params(user_text)
        cat = ap.get("category")
        if cat:
            ANOMALY_IGNORES.add(cat)
            return {
                "mode": "insights.anomalies.ignore",
                "filters": {"category": cat},
                "result": {"ignored": sorted(list(ANOMALY_IGNORES))},
                "message": f"Ignoring anomalies for {cat}",
            }

    # 2) Insights: anomalies — prioritize explicit anomaly intent over txn NL
    if det.detect_anomalies(user_text):
        p = det.extract_anomaly_params(user_text)
        result = compute_anomalies(
            db,
            months=p["months"],
            min_spend_current=p["min"],
            threshold_pct=p["threshold"],
            max_results=p["max"],
        )
        return {
            "mode": "insights.anomalies",
            "filters": {
                "months": p["months"],
                "min": p["min"],
                "threshold": p["threshold"],
                "max": p["max"],
            },
            "result": result,
            "message": None,
        }

    # 2) Category chart (single category) — explicit detector ahead of txn NL
    if det.detect_open_category_chart(user_text):
        cp = det.extract_chart_params(user_text)
        cat = cp.get("category")
        months = int(cp.get("months") or 6)
        if cat:
            series = get_category_timeseries(db, cat, months=months)
            return {
                "mode": "charts.category",
                "filters": {"category": cat, "months": months},
                "result": {"category": cat, "months": months, "series": series or []},
            }

    # 3) Temp budget overlay — detect and set for current month
    if det.detect_temp_budget(user_text):
        bp = det.extract_temp_budget_params(user_text)
        cat = bp.get("category")
        amt = bp.get("amount")
        if cat and (amt is not None):
            month_key = latest_month_str(db) or current_month_key()
            TEMP_BUDGETS[(month_key, cat)] = float(amt)
            return {
                "mode": "budgets.temp",
                "filters": {"month": month_key, "category": cat},
                "result": {"month": month_key, "category": cat, "amount": float(amt)},
                "message": f"Temporary budget set for {cat} @ {amt} in {month_key}",
            }

    # (moved) anomalies ignore handled above

    # 5) Transactions NL — use conservative detector to avoid generic messages
    is_txn, nlq = detect_txn_query(user_text)
    if is_txn and nlq is not None:
        res = run_txn_query(db, nlq)
        return {"mode": "nl_txns", "filters": res.get("filters"), "result": res}

    # 6) Charts (summary/flows/merchants/categories)
    charts_kind: Optional[str] = None
    if any(k in text_low for k in ["trend", "spending trend", "series", "by day", "by week", "by month", "time series", "flows", "cash flow", "net flow", "inflow", "outflow"]):
        charts_kind = "flows"
    elif any(k in text_low for k in ["top merchants", "merchants breakdown", "merchant spend"]):
        charts_kind = "merchants"
    elif any(k in text_low for k in ["categories", "category breakdown", "by category"]):
        charts_kind = "categories"
    elif any(k in text_low for k in ["summary", "overview", "snapshot"]):
        charts_kind = "summary"

    if charts_kind:
        month = _extract_month(user_text) or latest_month_str(db)
        if not month:
            return None
        if charts_kind == "summary":
            data = get_month_summary(db, month)
            return {"mode": "charts.summary", "filters": {"month": month}, "result": data}
        if charts_kind == "flows":
            data = get_month_flows(db, month)
            return {"mode": "charts.flows", "filters": {"month": month}, "result": data}
        if charts_kind == "merchants":
            data = get_month_merchants(db, month)
            # normalize to a simple array in result for consistency
            return {"mode": "charts.merchants", "filters": {"month": month}, "result": data.get("merchants", [])}
        if charts_kind == "categories":
            data = get_month_categories(db, month)
            return {"mode": "charts.categories", "filters": {"month": month}, "result": data}

    # 7) Reports (Excel/PDF) — return a link to existing endpoints
    if any(k in text_low for k in ["export", "download", "report", "excel", "xlsx", "pdf"]):
        month = _extract_month(user_text) or latest_month_str(db)
        qs = []
        if month:
            qs.append(f"month={month}")
        include_tx = ("include transaction" in text_low) or ("with transactions" in text_low)
        kind = "excel" if ("excel" in text_low or "xlsx" in text_low) else ("pdf" if "pdf" in text_low else "excel")
        if kind == "excel":
            if include_tx:
                qs.append("include_transactions=true")
            url = "/report/excel" + ("?" + "&".join(qs) if qs else "")
            return {"mode": "report.link", "filters": {"month": month}, "url": url, "meta": {"kind": "excel"}}
        else:
            url = "/report/pdf" + ("?" + "&".join(qs) if qs else "")
            return {"mode": "report.link", "filters": {"month": month}, "url": url, "meta": {"kind": "pdf"}}

    # 8) Budgets placeholder
    if detect_budget_recommendation(user_text):
        months = extract_months_or_default(user_text, default=6)
        recs = compute_recommendations(db, months=months)
        return {
            "mode": "budgets.recommendations",
            "filters": {"months": months},
            "result": {"months": months, "recommendations": recs},
            "message": None,
        }

    if any(k in text_low for k in ["budget", "over budget", "under budget", "remaining budget"]):
        return {
            "mode": "budgets.read",
            "filters": {},
            "result": None,
            "message": "Budget queries are not implemented yet. Try: 'Top categories this month' or 'Export Excel for last month'.",
        }

    return None