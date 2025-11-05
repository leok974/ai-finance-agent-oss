from __future__ import annotations
import json
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from starlette.responses import JSONResponse, RedirectResponse
from sqlalchemy.orm import Session
from sqlalchemy import desc

from app.db import get_db
from app.transactions import Transaction

# Import existing agent tools endpoints
from app.routers import agent_tools_charts, agent_tools_insights
from app.routers import (
    agent_tools_transactions,
    agent_tools_rules_crud,
)

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


def _enrich_context(
    db: Session, ctx: Optional[Dict[str, Any]], txn_id: Optional[str]
) -> Dict[str, Any]:
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
                merchants_result = agent_tools_charts.charts_merchants(
                    merchants_body, db
                )
                ctx["top_merchants"] = [
                    item.model_dump() for item in merchants_result.items
                ]
            except Exception as e:
                print(f"Error enriching merchants: {e}")

        if "insights" not in ctx:
            try:
                insights_body = agent_tools_insights.ExpandedBody(month=month)
                insights_result = agent_tools_insights.insights_expanded(
                    insights_body, db
                )
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
        final_messages.append(
            {"role": "system", "content": f"## CONTEXT\n{ctx_str}\n## INTENT: {intent}"}
        )

        reply, tool_trace = call_local_llm(
            model=model,
            messages=final_messages,
            temperature=temperature,
            top_p=top_p,
        )

        # Minimal, useful citations summary (counts only; keep UI light)
        citations = []
        if ctx.get("txn"):
            citations.append({"type": "txn", "id": ctx["txn"].get("id")})
        if ctx.get("rules"):
            citations.append({"type": "rules", "count": len(ctx["rules"])})
        if ctx.get("top_merchants"):
            citations.append({"type": "merchants", "count": len(ctx["top_merchants"])})
        if ctx.get("insights"):
            citations.append({"type": "insights", "count": 1})

        return JSONResponse(
            {
                "reply": reply,
                "citations": citations,
                "used_context": {"month": ctx.get("month")},
                "tool_trace": tool_trace,
                "model": model,
            }
        )

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
            return {
                "ok": True,
                "status": "ok",
                "pong": True,
                "reply": data.get("response", ""),
            }
    except Exception as e:
        return {"ok": False, "error": str(e)}


# Optional: gracefully deprecate any legacy /chat route by redirecting
@router.post("/gpt")
def deprecated_gpt_chat():
    return RedirectResponse(url="/agent/chat", status_code=307)
