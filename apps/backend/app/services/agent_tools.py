# apps/backend/app/services/agent_tools.py
from typing import Dict, Any
from .rules_engine import apply_rules
from collections import defaultdict
import json

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