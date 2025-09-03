from typing import Dict, Any
from .rules_engine import apply_rules

# Tool registry presented to the agent
def tool_specs():
    return [
        {
            "type": "function",
            "function": {
                "name": "categorize_txn",
                "description": "Assign a category to a transaction by id.",
                "parameters": {
                    "type": "object",
                    "properties": { "txn_id": {"type":"integer"}, "category": {"type":"string"} },
                    "required": ["txn_id","category"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "reclassify_month",
                "description": "Apply current rules to all unknown transactions for a month.",
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
                "name": "budget_check",
                "description": "Return a budget check for a month.",
                "parameters": {
                    "type": "object",
                    "properties": { "month": {"type":"string"} },
                    "required": ["month"]
                }
            }
        },
    ]

def call_tool(name: str, args: Dict[str, Any]):
    from ..main import app
    if name == "categorize_txn":
        tid = int(args["txn_id"]); cat = str(args["category"])
        for t in app.state.txns:
            if t["id"] == tid:
                t["category"] = cat
                return {"ok": True}
        return {"ok": False, "error": "txn not found"}

    if name == "reclassify_month":
        month = args["month"]
        changes = 0
        for t in app.state.txns:
            if t["date"].startswith(month) and (t.get("category") or "Unknown") == "Unknown":
                cat = apply_rules(t, app.state.rules) or None
                if cat:
                    t["category"] = cat
                    changes += 1
        return {"ok": True, "changes": changes}

    if name == "budget_check":
        from ..routers.budget import budget_check
        return budget_check(args["month"])

    return {"ok": False, "error": "unknown tool"}
