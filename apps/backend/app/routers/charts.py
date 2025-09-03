# apps/backend/app/routers/charts.py
from fastapi import APIRouter, Query, HTTPException
from collections import defaultdict
from datetime import datetime, timedelta

router = APIRouter()

@router.get("/month_summary")
def month_summary(month: str = Query(..., pattern=r"^\d{4}-\d{2}$")):
    """Get spending summary for a month"""
    from ..main import app
    
    # Filter transactions for the specified month
    month_txns = [t for t in app.state.txns if t["date"].startswith(month)]
    
    # Calculate totals
    total_spend = sum(abs(float(t["amount"])) for t in month_txns if float(t["amount"]) < 0)
    total_income = sum(float(t["amount"]) for t in month_txns if float(t["amount"]) > 0)
    
    # Group by category
    categories = defaultdict(float)
    for t in month_txns:
        if float(t["amount"]) < 0:  # Only expenses
            cat = t.get("category", "Unknown")
            categories[cat] += abs(float(t["amount"]))
    
    # Format categories for chart
    category_data = [
        {"name": cat, "amount": round(amount, 2)}
        for cat, amount in sorted(categories.items(), key=lambda x: -x[1])
    ]
    
    return {
        "month": month,
        "total_spend": round(total_spend, 2),
        "total_income": round(total_income, 2),
        "net": round(total_income - total_spend, 2),
        "categories": category_data
    }

@router.get("/month_merchants")
def month_merchants(month: str = Query(..., pattern=r"^\d{4}-\d{2}$")):
    """Get top merchants for a month"""
    from ..main import app
    
    month_txns = [t for t in app.state.txns if t["date"].startswith(month)]
    
    # Group by merchant
    merchants = defaultdict(float)
    for t in month_txns:
        if float(t["amount"]) < 0:  # Only expenses
            merchant = t.get("merchant", "Unknown")
            merchants[merchant] += abs(float(t["amount"]))
    
    # Sort by amount and take top 10
    merchant_data = [
        {"merchant": merchant, "amount": round(amount, 2)}
        for merchant, amount in sorted(merchants.items(), key=lambda x: -x[1])[:10]
    ]
    
    return {
        "month": month,
        "merchants": merchant_data
    }

@router.get("/month_flows")
def month_flows(month: str = Query(..., pattern=r"^\d{4}-\d{2}$")):
    """Get daily cash flows for a month"""
    from ..main import app
    
    month_txns = [t for t in app.state.txns if t["date"].startswith(month)]
    
    # Group by date
    daily_flows = defaultdict(lambda: {"in": 0.0, "out": 0.0})
    
    for t in month_txns:
        date = t["date"]
        amount = float(t["amount"])
        
        if amount > 0:
            daily_flows[date]["in"] += amount
        else:
            daily_flows[date]["out"] += abs(amount)
    
    # Convert to list and sort by date
    flows_data = []
    for date in sorted(daily_flows.keys()):
        flows_data.append({
            "date": date,
            "in": round(daily_flows[date]["in"], 2),
            "out": round(daily_flows[date]["out"], 2),
            "net": round(daily_flows[date]["in"] - daily_flows[date]["out"], 2)
        })
    
    return {
        "month": month,
        "series": flows_data
    }

@router.get("/spending_trends")
def spending_trends(months: int = Query(6, ge=1, le=24)):
    """Get spending trends over multiple months"""
    from ..main import app
    
    # Get all available months from transactions
    all_months = sorted(set(t["date"][:7] for t in app.state.txns))
    recent_months = all_months[-months:] if len(all_months) > months else all_months
    
    trends = []
    for month in recent_months:
        month_txns = [t for t in app.state.txns if t["date"].startswith(month)]
        
        total_spend = sum(abs(float(t["amount"])) for t in month_txns if float(t["amount"]) < 0)
        total_income = sum(float(t["amount"]) for t in month_txns if float(t["amount"]) > 0)
        
        # Category breakdown
        categories = defaultdict(float)
        for t in month_txns:
            if float(t["amount"]) < 0:
                cat = t.get("category", "Unknown")
                categories[cat] += abs(float(t["amount"]))
        
        trends.append({
            "month": month,
            "spending": round(total_spend, 2),
            "income": round(total_income, 2),
            "net": round(total_income - total_spend, 2),
            "categories": dict(categories)
        })
    
    return {
        "months": months,
        "trends": trends
    }