from __future__ import annotations
import json
from typing import Any, Dict, List, Optional, Tuple

from fastapi import APIRouter, Depends, HTTPException
from starlette.responses import JSONResponse, RedirectResponse
from sqlalchemy.orm import Session
from sqlalchemy import desc

from app.db import get_db
from app.orm_models import Transaction

# Import existing agent tools endpoints
from app.routers import agent_tools_charts, agent_tools_budget, agent_tools_insights 
from app.routers import agent_tools_transactions, agent_tools_rules_crud, agent_tools_meta

from app.utils.llm import call_local_llm

router = APIRouter()  # <-- no prefix here (main.py supplies /agent)

SYSTEM_PROMPT = """You are Finance Agent. You see a CONTEXT JSON with month summary,
rules, alerts, insights, suggestions, and (optionally) a specific transaction.

Rules:
- Be concise. Use bullets and short paragraphs.
- Always reference where your answer comes from (e.g., "(rule #14, month_summary.income, merchant: 'Spotify')").
- If unsure, say so and suggest a small next step.
- If intent = explain_txn, include:
  (1) probable category with 1–2 sentence reason,
  (2) 1–2 similar merchants this month,
  (3) any rule that almost matched,
  (4) one actionable next step ("create rule", "mark as transfer", etc.).
"""

def latest_month(db: Session) -> Optional[str]:
    """Get the latest month from transactions table"""
    try:
        latest = db.query(Transaction.month).order_by(desc(Transaction.month)).first()
        return latest.month if latest else None
    except Exception:
        return None

def _enrich_context(db: Session, ctx: Optional[Dict[str, Any]], txn_id: Optional[str]) -> Dict[str, Any]:
    ctx = dict(ctx or {})
    month = ctx.get("month") or latest_month(db)

    # Only fetch what's missing to stay cheap and composable
    if month:
        ctx["month"] = month
        
        if "summary" not in ctx:
            try:
                summary_body = agent_tools_charts.SummaryBody(month=month)
                summary_result = agent_tools_charts.charts_summary(summary_body, db)
                ctx["summary"] = summary_result.model_dump()
            except Exception as e:
                print(f"Error enriching summary: {e}")
                
        if "top_merchants" not in ctx:
            try:
                merchants_body = agent_tools_charts.MerchantsBody(month=month, top_n=10)
                merchants_result = agent_tools_charts.charts_merchants(merchants_body, db)
                ctx["top_merchants"] = [item.model_dump() for item in merchants_result.items]
            except Exception as e:
                print(f"Error enriching merchants: {e}")
                
        if "insights" not in ctx:
            try:
                insights_body = agent_tools_insights.ExpandedBody(month=month)
                insights_result = agent_tools_insights.insights_expanded(insights_body, db)
                ctx["insights"] = insights_result.model_dump()
            except Exception as e:
                print(f"Error enriching insights: {e}")
    
    if "rules" not in ctx:
        try:
            rules_result = agent_tools_rules_crud.list_rules(db)
            ctx["rules"] = [rule.model_dump() for rule in rules_result]
        except Exception as e:
            print(f"Error enriching rules: {e}")
            
    if txn_id and "txn" not in ctx:
        try:
            get_body = agent_tools_transactions.GetByIdsBody(txn_ids=[int(txn_id)])
            txn_result = agent_tools_transactions.get_by_ids(get_body, db)
            if txn_result.items:
                ctx["txn"] = txn_result.items[0].model_dump()
        except Exception as e:
            print(f"Error enriching transaction: {e}")

    return ctx

@router.post("/chat")
def agent_chat(payload: Dict[str, Any], db: Session = Depends(get_db)):
    messages: List[Dict[str, str]] = payload.get("messages", [])
    intent: str = payload.get("intent", "general")
    txn_id: Optional[str] = payload.get("txn_id")
    model: str = payload.get("model", "gpt-oss:20b")
    temperature: float = float(payload.get("temperature", 0.2))
    top_p: float = float(payload.get("top_p", 0.9))

    try:
        ctx = _enrich_context(db, payload.get("context"), txn_id)

        # Build final prompt for local model
        final_messages = [{"role": "system", "content": SYSTEM_PROMPT}]
        final_messages.extend(messages)

        # Attach trimmed JSON context to keep prompt bounded
        ctx_str = json.dumps(ctx, default=str)
        if len(ctx_str) > 6000:
            ctx_str = ctx_str[:6000] + " …(trimmed)"
        final_messages.append({"role":"system","content": f"## CONTEXT\n{ctx_str}\n## INTENT: {intent}"})

        reply, tool_trace = call_local_llm(
            model=model,
            messages=final_messages,
            temperature=temperature,
            top_p=top_p,
        )

        # Minimal, useful citations summary (counts only; keep UI light)
        citations = []
        if ctx.get("txn"): 
            citations.append({"type":"txn","id": ctx["txn"].get("id")})
        if ctx.get("rules"): 
            citations.append({"type":"rules","count": len(ctx["rules"])})
        if ctx.get("top_merchants"): 
            citations.append({"type":"merchants","count": len(ctx["top_merchants"])})
        if ctx.get("insights"): 
            citations.append({"type":"insights","count": 1})

        return JSONResponse({
            "reply": reply,
            "citations": citations,
            "used_context": {"month": ctx.get("month")},
            "tool_trace": tool_trace,
            "model": model,
        })
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Chat error: {str(e)}")

# Legacy compatibility endpoints
@router.get("/status")
def agent_status(model: str = "gpt-oss:20b"):
    """Ping local LLM to verify agent connectivity."""
    try:
        import urllib.request
        body = json.dumps({"model": model, "prompt": "pong!", "stream": False})
        req = urllib.request.Request(
            "http://127.0.0.1:11434/api/generate",
            data=body.encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=5.0) as resp:
            data = json.loads(resp.read().decode("utf-8", errors="ignore"))
            return {"ok": True, "status": "ok", "pong": True, "reply": data.get("response", "")}
    except Exception as e:
        return {"ok": False, "error": str(e)}

# Optional: gracefully deprecate any legacy /chat route by redirecting
@router.post("/gpt")
def deprecated_gpt_chat():
    return RedirectResponse(url="/agent/chat", status_code=307)

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
