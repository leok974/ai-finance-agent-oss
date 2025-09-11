from __future__ import annotations
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from app.services.charts_data import (
    get_month_summary,
    get_month_merchants,
    get_month_categories,
    latest_month_str,
)
from app.services.rules_service import create_rule
from app.services.ack_service import build_ack
from app.transactions import Transaction
from app.utils.state import get_state, set_state  # in-memory state you already use

# Types we return to the UI
PlanItem = Dict[str, Any]
Plan = Dict[str, Any]

def _suggest_rule_for_merchant(merchant: str, category: str) -> PlanItem:
    # Minimal rule input your rules router already accepts
    rule = {
        "name": f"{merchant} → {category}",
        "enabled": True,
        "when": {"merchant_contains": merchant},
        "then": {"category": category},
    }
    return {
        "kind": "seed_rule",
        "title": f"Auto-categorize {merchant} as {category}",
        "rule": rule,
        "impact": "medium",
    }

def _suggest_budget_limit(category: str, spend: float) -> PlanItem:
    # A gentle limit suggestion = last spend rounded up ~+10%
    target = round(spend * 1.1, 2)
    return {
        "kind": "budget_limit",
        "title": f"Set {category} budget ≈ {target}",
        "category": category,
        "limit": target,
        "impact": "low",
    }

def build_plan(db: Session, month: Optional[str]) -> Plan:
    # Resolve month and gather quick stats
    month_resolved = month or latest_month_str(db)
    if not month_resolved:
        raise ValueError("No month available to build a plan")
    summary = get_month_summary(db, month_resolved)
    cats = get_month_categories(db, month_resolved, limit=6)
    merch_data = get_month_merchants(db, month_resolved, limit=6)
    merch = merch_data.get("merchants", []) if isinstance(merch_data, dict) else (merch_data or [])

    # Build unknowns list (DB-backed)
    from sqlalchemy import func, desc
    unlabeled = (
        (Transaction.category.is_(None))
        | (func.trim(Transaction.category) == "")
        | (func.lower(Transaction.category) == "unknown")
    )
    rows = (
        db.query(Transaction)
        .filter(Transaction.month == month_resolved)
        .filter(unlabeled)
        .order_by(desc(Transaction.date), desc(Transaction.id))
        .all()
    )
    unknowns = [{
        "id": r.id,
        "date": r.date.isoformat() if r.date else "",
        "merchant": r.merchant or "",
        "description": r.description or "",
        "amount": float(r.amount or 0.0),
        "category": (r.category or "Unknown"),
    } for r in rows]

    items: List[PlanItem] = []

    # 1) If there are unknowns, propose bulk-categorize top few
    if unknowns:
        top_unk = unknowns[:5]
        items.append({
            "kind": "categorize_unknowns",
            "title": f"Categorize {len(top_unk)} unknown transactions",
            "txn_ids": [u["id"] for u in top_unk if "id" in u],
            "impact": "high",
        })

    # 2) Seed a couple of merchant→category rules based on top spenders
    #    (skip obvious transfers/income; your charts_data already normalizes spend)
    for m in merch[:3]:
        merchant = m.get("merchant") if isinstance(m, dict) else None
        if not merchant:
            continue
        # naive guess: if a merchant appears under a dominant category, suggest that category
        # fall back to "Shopping"
        category_guess = "Shopping"
        # If you have top category list, bias towards it
        if cats:
            category_guess = cats[0]["category"]
        items.append(_suggest_rule_for_merchant(merchant, category_guess))

    # 3) Offer to set budget limits for top 2 categories (if not absurdly small)
    for c in (cats or [])[:2]:
        if c["spend"] > 25:
            items.append(_suggest_budget_limit(c["category"], c["spend"]))

    # 4) Offer a ready-made monthly Excel report (download link handled by UI)
    items.append({
        "kind": "export_report",
        "title": "Export Excel report for this month",
        "impact": "low",
        "month": month_resolved
    })

    plan: Plan = {
        "ok": True,
        "month": month_resolved,
        "summary": summary,
        "items": items
    }
    # Save the latest plan in memory for a simple /status
    set_state("planner.last_plan", plan)
    return plan

def apply_actions(db: Session, month: str, actions: List[Dict[str, Any]]) -> Dict[str, Any]:
    created_rules = 0
    categorized = 0
    budgets_set = 0
    # you might already have a budget overlay service; for demo we keep it ephemeral in state
    budgets_overlay = get_state("budgets.overlay") or {}

    for act in actions:
        kind = act.get("kind")
        if kind == "seed_rule":
            rule = act.get("rule") or {}
            create_rule(db, rule)  # persists rule
            created_rules += 1
        elif kind == "categorize_unknowns":
            txn_ids = act.get("txn_ids") or []
            # Use a simple default category when bulk-fixing; the UI can supply chosen category later
            default_cat = act.get("category") or "Shopping"
            for tid in txn_ids:
                try:
                    tdb = db.get(Transaction, tid)
                    if not tdb:
                        continue
                    tdb.category = default_cat
                    db.commit()
                    db.refresh(tdb)
                    categorized += 1
                except Exception:
                    # best-effort
                    pass
        elif kind == "budget_limit":
            cat = act.get("category")
            limit = float(act.get("limit") or 0)
            if cat and limit > 0:
                budgets_overlay[cat] = limit
                budgets_set += 1
        elif kind == "export_report":
            # no-op here; front-end calls /report/excel for download
            pass

    set_state("budgets.overlay", budgets_overlay)
    msg = build_ack(
        scope="planner.apply",
        updated_count=created_rules + categorized + budgets_set,
        extra={
            "rules_created": created_rules,
            "txns_categorized": categorized,
            "budgets_set": budgets_set
        }
    )
    return {"ok": True, "ack": msg, "rules_created": created_rules, "txns_categorized": categorized, "budgets_set": budgets_set}
