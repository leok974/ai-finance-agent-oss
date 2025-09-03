from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional, Literal, Dict, Any
import json, urllib.request, re
from ..services import agent_tools  # tool_specs / call_tool live here
from ..routers import charts        # call chart endpoints as functions
from ..routers.budget import budget_check
from ..utils.dates import latest_month_from_txns

router = APIRouter()  # <-- no prefix here (main.py supplies /agent)

# Optional compatibility models: accept either a simple prompt or messages[]
class Msg(BaseModel):
    role: Literal["system", "user", "assistant"]
    content: str

class ChatReq(BaseModel):
    prompt: Optional[str] = None
    messages: Optional[List[Msg]] = None

@router.get("/status")
def agent_status(model: str = "gpt-oss:20b"):
    """Ping Ollama with a tiny prompt to verify agent connectivity."""
    try:
        body = json.dumps({"model": model, "prompt": "pong!", "stream": False})
        req = urllib.request.Request(
            "http://127.0.0.1:11434/api/generate",
            data=body.encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=5.0) as resp:
            data = json.loads(resp.read().decode("utf-8", errors="ignore"))
            # Include broader compatibility flags
            return {"ok": True, "status": "ok", "pong": True, "reply": data.get("response", "")}
    except Exception as e:
        return {"ok": False, "error": str(e)}

# --- helpers for intent and context parsing ---

MONTH_RE = re.compile(r"\b(20\d{2})[-/](0[1-9]|1[0-2])\b")
AMOUNT_RE = re.compile(r"(?:(?:over|above|greater than|>)\s*\$?\s*(\d+(?:\.\d+)?))|(?:\$\s*(\d+(?:\.\d+)?))", re.I)
MONTH_WORDS = {
    "january":"01","february":"02","march":"03","april":"04","may":"05","june":"06",
    "july":"07","august":"08","september":"09","october":"10","november":"11","december":"12"
}

def extract_month(text: str) -> Optional[str]:
    m = MONTH_RE.search(text)
    if m: return f"{m.group(1)}-{m.group(2)}"
    t = text.lower()
    for name, mm in MONTH_WORDS.items():
        if name in t:
            y = re.search(r"(20\d{2})", t)
            if y: return f"{y.group(1)}-{mm}"
    return None

def extract_min_amount(text: str) -> Optional[float]:
    vals = []
    for m in AMOUNT_RE.finditer(text):
        x = m.group(1) or m.group(2)
        try:
            vals.append(float(x))
        except Exception:
            pass
    if not vals:
        return None
    if re.search(r"\bover|above|greater than|>\b", text, re.I):
        return max(vals)
    return max(vals)

def parse_tool_context(messages: List[Msg]) -> Dict[str, Any]:
    ctx: Dict[str, Any] = {}
    for m in messages:
        if m.role != "system":
            continue
        if m.content.startswith("[tool:"):
            try:
                label_end = m.content.index("]")
                label = m.content[6:label_end]
                payload_str = m.content[label_end+1:].strip()
                payload = json.loads(payload_str) if payload_str else {}
                ctx[label] = payload
            except Exception:
                continue
    return ctx

def bullets(items: List[str]) -> str:
    return "\n".join([f"• {x}" for x in items if x])


# --- main chat handler ---

@router.post("/chat")
def agent_chat(req: ChatReq):
    # Normalize messages
    messages: List[Msg] = req.messages or [Msg(role="user", content=req.prompt or "")]
    if not messages:
        raise HTTPException(status_code=422, detail="Provide 'messages' or 'prompt'")

    user_text = next((m.content for m in reversed(messages) if m.role == "user"), "")
    tool_ctx = parse_tool_context(messages)

    # derive month & thresholds from either tool_ctx or the user text
    month = (
        (tool_ctx.get("context_month_hint") or {}).get("month")
        or extract_month(user_text)
        or (tool_ctx.get("month_summary") or {}).get("month")
    )

    # Optional smart default: fall back to latest month in memory if none specified
    if not month:
        # import here to avoid circular import at module load
        from ..main import app
        try:
            txns = getattr(app.state, "txns", [])
            month = latest_month_from_txns(txns)
        except Exception:
            # ignore and leave 'month' as None if anything goes wrong
            pass
    min_amount = extract_min_amount(user_text)

    # intent routing
    text = user_text.lower()

    try:
        if any(k in text for k in ["summary", "overview", "net", "income", "spend"]) and month:
            out = agent_tools.call_tool("get_spending_summary", {"month": month})
            parts = [
                f"{month} summary:",
                f"Spend: ${out['total_spent']:.2f} | Income: ${out['total_income']:.2f} | Net: ${out['net']:.2f}",
            ]
            cats = sorted((out.get("categories") or {}).items(), key=lambda x: -x[1])[:5]
            if cats:
                parts.append("Top categories: " + ", ".join(f"{k} (${v:.0f})" for k,v in cats))
            return {"reply": "\n".join(parts)}

        if any(k in text for k in ["large", "big", "over", "greater than", ">","high-value","expensive","largest"]):
            args: Dict[str, Any] = {"min_amount": min_amount or 500.0}
            if month:
                args["month"] = month
            found = agent_tools.call_tool("find_transactions", args)
            txns = found.get("transactions", [])[:10]
            if not txns:
                return {"reply": f"No transactions found {('in '+month) if month else ''} over ${args['min_amount']:.0f}."}
            lines = [f"Top {len(txns)} large transactions{(' in '+month) if month else ''} (≥ ${args['min_amount']:.0f}):"]
            for t in txns:
                lines.append(f"- {t['date']} — {t.get('merchant') or t.get('description') or 'Unknown'} — ${abs(t['amount']):,.2f} [{t.get('category','Unknown')}]")
            return {"reply": "\n".join(lines)}

        if "budget" in text or "over budget" in text or "under budget" in text:
            if not month:
                return {"reply": "Which month should I analyze for budgets? (e.g., 2023-12)"}
            out = agent_tools.call_tool("budget_analysis", {"month": month})
            items = out.get("budget_items", [])
            overs = [i for i in items if i.get("over", 0) > 0]
            reply = [
                f"Budget health for {month}: {out.get('budget_health','Unknown')}",
                f"Overspend total: ${out.get('total_overspend',0):.2f}",
            ]
            if overs:
                reply.append("Over budget: " + ", ".join(f"{x['category']} (+${x['over']:.0f})" for x in overs[:5]))
            return {"reply": "\n".join(reply)}

        if "trend" in text or "trends" in text or "last" in text:
            n = None
            m = re.search(r"last\s+(\d{1,2})\s+months", text)
            if m:
                n = int(m.group(1))
            out = agent_tools.call_tool("spending_trends", {"months": n or 6})
            rows = out.get("trends", [])
            if not rows:
                return {"reply": "No trend data yet."}
            line = ", ".join(f"{r['month']}: ${r['spent']:.0f}" for r in rows[-6:])
            return {"reply": f"Spending trend ({out.get('category','all')}): {line}\nAvg: ${out.get('avg_monthly',0):.0f} ({out.get('trend_direction')})"}

        # merchants/categories (from charts module)
        if "merchant" in text and month:
            m = charts.month_merchants(month)  # call the router function directly
            top = m.get("merchants", [])[:10]
            if not top:
                return {"reply": f"No merchant data for {month}."}
            return {"reply": "Top merchants: " + ", ".join(f"{x['merchant']} (${x['amount']:.0f})" for x in top)}

        if "category" in text and month:
            s = charts.month_summary(month)
            top = (s.get("categories") or [])[:10]
            if not top:
                return {"reply": f"No category data for {month}."}
            return {"reply": "Top categories: " + ", ".join(f"{x['name']} (${x['amount']:.0f})" for x in top)}

        # fallback concise echo
        return {"reply": f"I’m here. Try asking, e.g., 'Summarize {month or '2023-12'}' or 'Large transactions over $500'."}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"agent error: {e}")
