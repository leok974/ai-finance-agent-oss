from __future__ import annotations
import json
print("[agent.py] loaded version: refactor-tagfix-1")
import re
import logging
from typing import Any, Dict, List, Optional, Tuple, Literal
from app.services.agent.llm_post import post_process_tool_reply
from app.services.agent_tools.common import no_data_kpis, no_data_anomalies
from app.utils.time import utc_now

from fastapi import APIRouter, Depends, HTTPException, Query, Header
from starlette.responses import JSONResponse, RedirectResponse
from sqlalchemy.orm import Session
from sqlalchemy import desc
from pydantic import BaseModel, field_validator

from app.db import get_db
from app.transactions import Transaction

# Import existing agent tools endpoints
from app.routers import agent_tools_charts, agent_tools_budget, agent_tools_insights 
from app.routers import agent_tools_transactions, agent_tools_rules_crud, agent_tools_meta

from app.utils import llm as llm_mod  # <-- import module so tests can monkeypatch
from app.config import settings
from app.services.agent_detect import detect_txn_query, summarize_txn_result, infer_flow, try_llm_rephrase_summary
from app.services.txns_nl_query import run_txn_query
from app.services.agent_tools import route_to_tool
from app.services.agent.router_fallback import route_to_tool_with_fallback
from app.services.agent.analytics_tag import tag_if_analytics
import time

router = APIRouter()  # <-- no prefix here (main.py supplies /agent)

# --- KPI empty-state guard (router-level) ---
from app.services.agent_tools.common import no_data_kpis as _router_no_data_kpis

def _emptyish(v):
    if v is None:
        return True
    if isinstance(v, dict):
        return len(v) == 0 or all(_emptyish(x) for x in v.values())
    if isinstance(v, (list, tuple, set)):
        return len(v) == 0
    return False

def enforce_analytics_empty_state(out: dict) -> dict:
    try:
        if out.get("mode") == "analytics.kpis":
            result = out.get("result") or {}
            k, s, m = result.get("kpis"), result.get("series"), result.get("months")
            if _emptyish(k) or _emptyish(s) or _emptyish(m):
                month = (out.get("filters") or {}).get("month") or (out.get("used_context") or {}).get("month")
                tip = _router_no_data_kpis(str(month) if month else None)
                out.update(tip)
                out["_post_kpis_guard"] = True
    except Exception:
        pass
    return out

# Model name normalization
MODEL_ALIASES = {
    # Local aliases (Ollama-style tags)
    "gpt-oss:20b": "gpt-oss:20b",
    "gpt-oss-20b": "gpt-oss:20b",
    # Convenience shortcuts -> defer to config default
    "gpt": None,
    "default": None,
}

# Sensitive keys for PII redaction in logs

SYSTEM_PROMPT = """You are Finance Agent. You receive a CONTEXT JSON with month summary,
rules, alerts, insights, suggestions, and optionally a specific transaction.

Style:
- Use clean, human-readable bullets; no raw JSON keys or array indices.
- If you cite data, do it naturally ("month summary", "a matching rule", "top merchants include Delta").
- End with one clear next step when helpful.
- If unsure, say so and propose a tiny action to get certainty.

For intent=explain_txn, include:
1) Probable category with a 1–2 sentence reason.
2) 1–2 similar merchants this month if relevant.
3) Any rule that almost matched (briefly).
4) Exactly one next step (e.g., "Create a rule", "Mark as transfer").
"""

# Intent-specific system hints for better behavior
INTENT_HINTS = {
    "general": "Answer budgeting and transaction questions using CONTEXT. Be helpful and reference specific data points.",
    "explain_txn": "Explain the specific transaction in CONTEXT.txn. Provide category suggestion, similar transactions, rule matches, and actionable next steps.",
    "budget_help": "Focus on budgets, categories, and month-over-month deltas. Help with budget planning and spending analysis.",
    "rule_seed": "Propose a precise rule pattern and its category. Be specific about merchant matching and suggest optimal categorization rules."
}

# PII redaction for logging
SENSITIVE_KEYS = {"content", "merchant", "description", "account_number", "address", "phone", "email"}

def redact_pii(d):
    """Recursively redact sensitive information from data structures for logging."""
    if isinstance(d, dict):
        return {k: ("[redacted]" if k in SENSITIVE_KEYS else redact_pii(v)) for k, v in d.items()}
    if isinstance(d, list):
        return [redact_pii(x) for x in d]
    return d

def estimate_tokens(text: str) -> int:
    """Rough token estimation: ~4 chars per token for English text."""
    return len(text) // 4

def trim_ctx_for_prompt(ctx: dict, max_chars: int = 8000) -> dict:
    """
    Smart context trimming that drops lowest-value fields first.
    Priority order: suggestions → top_merchants → insights → alerts → rules
    Keep: month + txn + summary (core data)
    """
    trim_order = ["suggestions", "top_merchants", "insights", "alerts", "rules"]
    calc_size = lambda d: len(json.dumps(d, default=str))
    
    if calc_size(ctx) <= max_chars:
        return ctx
    
    trimmed = dict(ctx)
    
    for field in trim_order:
        if field in trimmed:
            if isinstance(trimmed[field], list):
                # For lists, trim to half size first
                original_len = len(trimmed[field])
                trimmed[field] = trimmed[field][:max(1, original_len // 2)]
                
                # If still too big, remove entirely
                if calc_size(trimmed) > max_chars:
                    del trimmed[field]
            else:
                # For non-lists, remove entirely
                del trimmed[field]
            
            # Check if we're under the limit now
            if calc_size(trimmed) <= max_chars:
                break
    
    return trimmed

def latest_txn_for_month(db: Session, month: str) -> Optional[Dict[str, Any]]:
    """
    Fallback: find the most recent transaction for the given month.
    Returns transaction as dict or None if no transactions found.
    """
    try:
        txn = db.query(Transaction).filter(
            Transaction.month == month
        ).order_by(desc(Transaction.date), desc(Transaction.id)).first()
        
        if txn:
            return {
                "id": txn.id,
                "date": str(txn.date),
                "merchant": txn.merchant,
                "description": txn.description,
                "amount": txn.amount,
                "category": txn.category,
                "account": txn.account,
                "month": txn.month
            }
    except Exception as e:
        logging.warning(f"Failed to find latest transaction for month {month}: {e}")
    
    return None

def parse_txn_from_message(message: str) -> Optional[Dict[str, Any]]:
    """
    Try to parse merchant/amount/date from a user message like:
    'Explain this $4.50 charge from Starbucks'
    'What was that Target purchase for $23.45?'
    Returns None if parsing fails.
    """
    try:
        # Look for amount patterns: $12.34, 12.34, $12
        amount_match = re.search(r'\$?(\d+\.?\d*)', message)
        
        # Look for merchant patterns (capitalize words that might be business names)
        # This is very naive - just grab capitalized words
        merchant_match = re.findall(r'\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b', message)
        
        if amount_match:
            return {
                "parsed_amount": float(amount_match.group(1)),
                "parsed_merchant": merchant_match[0] if merchant_match else None,
                "source": "message_parse"
            }
    except Exception:
        pass
    
    return None

# Pydantic models for request validation
class ChatMessage(BaseModel):
    role: Literal["system", "user", "assistant"]
    content: str

class AgentChatRequest(BaseModel):
    messages: List[ChatMessage]
    context: Optional[Dict[str, Any]] = None
    intent: Literal["general", "explain_txn", "budget_help", "rule_seed"] = "general"
    txn_id: Optional[str] = None
    # Optional mode override from client to bypass deterministic router
    # e.g., "rephrase", "charts.month_summary", etc.
    mode: Optional[str] = None
    # Explicit flag to force bypassing router (matches suggested API)
    force_llm: Optional[bool] = False
    model: str = "gpt-oss:20b"
    temperature: float = 0.2
    top_p: float = 0.9

    @field_validator("messages")
    @classmethod
    def non_empty_messages(cls, v):
        if not v:
            raise ValueError("messages cannot be empty")
        return v

    @field_validator("temperature")
    @classmethod
    def valid_temperature(cls, v):
        if not (0.0 <= v <= 2.0):
            raise ValueError("temperature must be between 0.0 and 2.0")
        return v

    @field_validator("top_p")
    @classmethod
    def valid_top_p(cls, v):
        if not (0.0 <= v <= 1.0):
            raise ValueError("top_p must be between 0.0 and 1.0")
        return v

def latest_month(db: Session) -> Optional[str]:
    """Get the latest month from transactions table"""
    try:
        latest = db.query(Transaction.month).order_by(desc(Transaction.month)).first()
        return latest.month if latest else None
    except Exception:
        return None

def _enrich_context(db: Session, ctx: Optional[Dict[str, Any]], txn_id: Optional[str]) -> Dict[str, Any]:
    ctx = dict(ctx or {})
    month = ctx.get("month") or latest_month(db) or "1970-01"  # Safe fallback

    # Only fetch what's missing to stay cheap and composable
    if month:
        ctx["month"] = month
        
        if "summary" not in ctx:
            try:
                summary_body = agent_tools_charts.SummaryBody(month=month)
                summary_result = agent_tools_charts.charts_summary(summary_body, db)
                ctx["summary"] = summary_result.model_dump()
            except Exception as e:
                print(f"Error enriching summary: {redact_pii(str(e))}")
                
        if "top_merchants" not in ctx:
            try:
                merchants_body = agent_tools_charts.MerchantsBody(month=month, top_n=10)
                merchants_result = agent_tools_charts.charts_merchants(merchants_body, db)
                ctx["top_merchants"] = [item.model_dump() for item in merchants_result.items]
            except Exception as e:
                print(f"Error enriching merchants: {redact_pii(str(e))}")
                
        if "insights" not in ctx:
            try:
                # Use the proper request shape for insights_expanded
                insights_body = agent_tools_insights.ExpandedIn(month=month, large_limit=10)
                raw = agent_tools_insights.insights_expanded(insights_body, db)
                # Normalize to a tiny, resilient shape to avoid prompt bloat
                # and tolerate schema changes.
                if isinstance(raw, dict):
                    normalized = agent_tools_insights.expand(raw).model_dump()
                else:
                    try:
                        normalized = agent_tools_insights.expand(raw.model_dump()).model_dump()  # type: ignore[attr-defined]
                    except Exception:
                        normalized = agent_tools_insights.ExpandedBody().model_dump()
                ctx["insights"] = normalized
            except Exception as e:
                print(f"Error enriching insights: {redact_pii(str(e))}")
    
    if "rules" not in ctx:
        try:
            rules_result = agent_tools_rules_crud.list_rules(db)
            ctx["rules"] = [rule.model_dump() for rule in rules_result]
        except Exception as e:
            print(f"Error enriching rules: {redact_pii(str(e))}")
            
    if txn_id and "txn" not in ctx:
        try:
            get_body = agent_tools_transactions.GetByIdsBody(txn_ids=[int(txn_id)])
            txn_result = agent_tools_transactions.get_by_ids(get_body, db)
            if txn_result.items:
                ctx["txn"] = txn_result.items[0].model_dump()
        except Exception as e:
            print(f"Error enriching transaction: {redact_pii(str(e))}")

    return ctx

@router.post("/chat")
def agent_chat(
    req: AgentChatRequest,
    db: Session = Depends(get_db),
    debug: bool = Query(False, description="Return raw CONTEXT in response (dev only)"),
    mode_override: Optional[str] = Query(default=None, alias="mode"),
    bypass_router: bool = Query(False, alias="bypass_router"),
    x_bypass_router: Optional[str] = Header(default=None, alias="X-Bypass-Router"),
):
    try:
        print(f"Agent chat request: {redact_pii(req.model_dump())}")
        ctx = _enrich_context(db, req.context, req.txn_id)
        last_user_msg = next((m.content for m in reversed(req.messages) if m.role == "user"), "")
        resp: Dict[str, Any] | None = None

        override_modes = {
            "rephrase",
            "charts.month_summary",
            "charts.month_merchants",
            "charts.month_flows",
            "charts.spending_trends",
            "insights.expanded",
            "budget.check",
        }
        effective_mode = (req.mode or mode_override or "").strip()
        bypass = (
            bool(req.force_llm)
            or bool(bypass_router)
            or (str(x_bypass_router).lower() in {"1", "true", "yes"})
            or (effective_mode in override_modes)
        )
        logging.getLogger("uvicorn").debug(
            "agent.chat mode=%s routed=%s",
            effective_mode or "(none)",
            "llm" if bypass else "router",
        )

        if bypass:
            intent_hint = INTENT_HINTS.get(req.intent, INTENT_HINTS["general"])
            enhanced_system_prompt = f"{SYSTEM_PROMPT}\n\n{intent_hint}"
            final_messages = [{"role": "system", "content": enhanced_system_prompt}] + [{"role": m.role, "content": m.content} for m in req.messages]
            trimmed_ctx = trim_ctx_for_prompt(ctx, max_chars=8000)
            ctx_str = json.dumps(trimmed_ctx, default=str)
            if len(ctx_str) > 10000:
                ctx_str = ctx_str[:10000] + " …(hard-trimmed)"
            final_messages.append({"role": "system", "content": f"## CONTEXT\n{ctx_str}\n## INTENT: {req.intent}"})
            requested_model = req.model if req.model else settings.DEFAULT_LLM_MODEL
            model = MODEL_ALIASES.get(requested_model, requested_model) or settings.DEFAULT_LLM_MODEL
            reply, tool_trace = llm_mod.call_local_llm(model=model, messages=final_messages, temperature=req.temperature, top_p=req.top_p)
            resp = {"reply": reply, "citations": [], "used_context": {"month": ctx.get("month")}, "tool_trace": tool_trace, "model": model}
        else:
            if req.intent in ("general", "budget_help"):
                t0 = time.perf_counter()
                tool_resp = route_to_tool(last_user_msg, db) or route_to_tool_with_fallback(last_user_msg, ctx=db, db=db)
                if tool_resp is not None:
                    dt_ms = int((time.perf_counter() - t0) * 1000)
                    summary = _summarize_tool_result(tool_resp) or ""
                    clean = summary.strip()
                    lower = clean.lower()
                    normalized = lower.replace("�", "'")
                    bypass_rephrase = (not clean or lower in {"ok", "okay"} or lower.rstrip(".") in {"ok", "okay"} or "i couldn't find any transactions" in normalized or "i couldnt find any transactions" in normalized)
                    rephrased = None if bypass_rephrase else _try_llm_rephrase_tool(last_user_msg, tool_resp, clean)
                    message = (rephrased or clean).strip() or clean
                    resp = {
                        "ok": True,
                        "mode": tool_resp.get("mode"),
                        "reply": message,
                        "message": message,
                        "summary": summary,
                        "rephrased": rephrased,
                        "filters": tool_resp.get("filters"),
                        "args": tool_resp.get("args"),
                        "result": tool_resp.get("result"),
                        "url": tool_resp.get("url"),
                        "citations": [{"type": "summary", "count": 1}],
                        "used_context": {"month": ctx.get("month")},
                        "tool_trace": [{"tool": "router", "mode": tool_resp.get("mode"), "args": tool_resp.get("args"), "duration_ms": dt_ms, "status": "short_circuit"}],
                        "model": "deterministic",
                    }
                else:
                    _l = last_user_msg.lower()
                    if any(k in _l for k in ("kpi", "kpis", "forecast", "anomal", "recurring", "budget")):
                        resp = {
                            "reply": ("I didn’t find enough context to run the analytics tool directly. Try again, or switch to a month with data / Insights: Expanded."),
                            "rephrased": False,
                            "mode": "analytics",
                            "meta": {"reason": "router_fallback"},
                            "used_context": {"month": ctx.get("month")},
                            "tool_trace": [{"tool": "analytics.fallback", "status": "stub"}],
                            "model": "deterministic",
                        }
            if resp is None:
                is_txn, nlq = detect_txn_query(last_user_msg)
                if is_txn and req.intent in ("general", "budget_help"):
                    flow = infer_flow(last_user_msg)
                    if flow:
                        setattr(nlq, "flow", flow)
                    import re as _re
                    m_pg = _re.search(r"page\s+(\d{1,3})", last_user_msg.lower())
                    if m_pg:
                        setattr(nlq, "page", int(m_pg.group(1)))
                    qres = run_txn_query(db, nlq)
                    if getattr(nlq, "flow", None):
                        qres.setdefault("filters", {})["flow"] = getattr(nlq, "flow")
                    summary = summarize_txn_result(qres)
                    rephrased = try_llm_rephrase_summary(last_user_msg, qres, summary)
                    resp = {
                        "mode": "nl_txns", "reply": rephrased or summary, "summary": summary, "rephrased": rephrased, "nlq": qres.get("filters"), "result": qres,
                        "citations": [{"type": "summary", "count": 1}], "used_context": {"month": ctx.get("month")}, "tool_trace": [{"tool": "nl_txns", "status": "short_circuit"}], "model": "deterministic"}

        if resp is None and req.intent == "explain_txn" and not req.txn_id and "txn" not in ctx:
            parsed_info = parse_txn_from_message(last_user_msg) if req.messages else None
            if parsed_info:
                print(f"Parsed transaction info from message: {parsed_info}")
            if ctx.get("month"):
                fallback_txn = latest_txn_for_month(db, ctx["month"])
                if fallback_txn:
                    ctx["txn"] = fallback_txn
                    print(f"Using fallback transaction: {redact_pii(fallback_txn)}")

        if resp is None:
            intent_hint = INTENT_HINTS.get(req.intent, INTENT_HINTS["general"])
            enhanced_system_prompt = f"{SYSTEM_PROMPT}\n\n{intent_hint}"
            final_messages = [{"role": "system", "content": enhanced_system_prompt}] + [{"role": m.role, "content": m.content} for m in req.messages]
            trimmed_ctx = trim_ctx_for_prompt(ctx, max_chars=8000)
            ctx_str = json.dumps(trimmed_ctx, default=str)
            if len(ctx_str) > 10000:
                ctx_str = ctx_str[:10000] + " …(hard-trimmed)"
            final_messages.append({"role": "system", "content": f"## CONTEXT\n{ctx_str}\n## INTENT: {req.intent}"})
            original_size = len(json.dumps(ctx, default=str))
            trimmed_size = len(ctx_str)
            if original_size != trimmed_size:
                print(f"Context trimmed: {original_size} → {trimmed_size} chars")
            else:
                print(f"Context size: {trimmed_size} chars")
            requested_model = req.model if req.model else settings.DEFAULT_LLM_MODEL
            model = MODEL_ALIASES.get(requested_model, requested_model) or settings.DEFAULT_LLM_MODEL
            reply, tool_trace = llm_mod.call_local_llm(model=model, messages=final_messages, temperature=req.temperature, top_p=req.top_p)
            citations = []
            for key, citation_type in [("summary", "summary"),("rules", "rules"),("top_merchants", "merchants"),("alerts", "alerts"),("insights", "insights")]:
                if ctx.get(key):
                    val = ctx[key]; citations.append({"type": citation_type, "count": (len(val) if isinstance(val, list) else 1)})
            if ctx.get("txn"):
                citations.append({"type": "txn", "id": ctx["txn"].get("id")})
            resp = {"reply": reply, "citations": citations, "used_context": {"month": ctx.get("month")}, "tool_trace": tool_trace, "model": model}

        resp = post_process_tool_reply(resp, ctx)
        if debug and getattr(settings, "ENV", "dev") != "prod":
            resp["__debug_context"] = ctx

        # --- BEGIN post-processing guard for trivial "OK" on analytics prompts ---
        try:
            user_text = last_user_msg or ""
            if _is_trivial_ok(resp.get("reply")):
                hint = _analytics_intent_from_user(user_text)
                if hint:
                    prev_used_ctx = resp.get("used_context") or {}
                    month_str = _month_str_from_out_or_now(resp)
                    if hint == "insights.anomalies":
                        resp = no_data_anomalies(month_str)
                    elif hint == "analytics.kpis":
                        resp = no_data_kpis(month_str)
                    if prev_used_ctx and "used_context" not in resp:
                        resp["used_context"] = prev_used_ctx
                    resp["_post_ok_guard"] = True
        except Exception:
            pass
        # --- END post-processing guard ---

        resp = enforce_analytics_empty_state(resp)

        return JSONResponse(tag_if_analytics(last_user_msg, resp))
    except Exception as e:
        print(f"Agent chat error: {str(e)}")
        try:
            print(f"Request context: {redact_pii(req.model_dump() if hasattr(req, 'model_dump') else {})}")
        except Exception:
            pass
        raise HTTPException(status_code=500, detail=f"Chat error: {str(e)}")


@router.post("/rephrase")
def agent_rephrase(
    req: AgentChatRequest,
    db: Session = Depends(get_db),
    debug: bool = Query(False, description="Return raw CONTEXT in response (dev only)"),
):
    """Clean endpoint to always hit the LLM path without tool/router logic."""
    # Minimal enrichment (keep same helpers for consistency)
    ctx = _enrich_context(db, req.context, req.txn_id)
    intent_hint = INTENT_HINTS.get(req.intent, INTENT_HINTS["general"])
    enhanced_system_prompt = f"{SYSTEM_PROMPT}\n\n{intent_hint}"
    final_messages = [{"role": "system", "content": enhanced_system_prompt}] + [
        {"role": m.role, "content": m.content} for m in req.messages
    ]
    trimmed_ctx = trim_ctx_for_prompt(ctx, max_chars=8000)
    ctx_str = json.dumps(trimmed_ctx, default=str)
    if len(ctx_str) > 10000:
        ctx_str = ctx_str[:10000] + " …(hard-trimmed)"
    final_messages.append({"role": "system", "content": f"## CONTEXT\n{ctx_str}\n## INTENT: {req.intent}"})

    requested_model = req.model if req.model else settings.DEFAULT_LLM_MODEL
    model = MODEL_ALIASES.get(requested_model, requested_model)
    if model is None:
        model = settings.DEFAULT_LLM_MODEL

    reply, tool_trace = llm_mod.call_local_llm(
        model=model,
        messages=final_messages,
        temperature=req.temperature,
        top_p=req.top_p,
    )
    resp = {
        "reply": reply,
        "citations": [],
        "used_context": {"month": ctx.get("month")},
        "tool_trace": tool_trace,
        "model": model,
    }
    if debug and getattr(settings, "ENV", "dev") != "prod":
        resp["__debug_context"] = ctx
    return JSONResponse(resp)


def _fmt_usd(v: float) -> str:
    sign = "-" if v < 0 else ""
    return f"{sign}${abs(v):,.2f}"


def _fmt_window(f: Dict[str, Any]) -> str:
    if f and f.get("start") and f.get("end"):
        return f" ({f['start']} → {f['end']})"
    if f and f.get("month"):
        return f" ({f['month']})"
    return ""


def _summarize_tool_result(tool_resp: Dict[str, Any]) -> str:
    message = tool_resp.get("message")
    if message:
        return str(message)
    mode = tool_resp.get("mode")
    if mode == "nl_txns":
        # tool_resp.result is the full run_txn_query dict
        res = tool_resp.get("result")
        return summarize_txn_result(res)
    if mode == "charts.summary":
        s = tool_resp.get("result") or {}
        parts = []
        if isinstance(s, dict):
            if "total_spend" in s:
                parts.append(f"Total spend {_fmt_usd(float(s['total_spend']))}")
            if "total_income" in s:
                parts.append(f"Income {_fmt_usd(float(s['total_income']))}")
            if "net" in s:
                parts.append(f"Net {_fmt_usd(float(s['net']))}")
        window = _fmt_window(tool_resp.get("filters", {}))
        return (", ".join(parts) or "Summary ready") + window + "."
    if mode == "charts.flows":
        series = tool_resp.get("result", {}).get("series") if isinstance(tool_resp.get("result"), dict) else None
        n = len(series or [])
        window = _fmt_window(tool_resp.get("filters", {}))
        return f"Returned {n} flow points{window}."
    if mode == "charts.merchants":
        rows = tool_resp.get("result") or []
        top = ", ".join(f"{(r.get('merchant') or '?')} ({_fmt_usd(float(r.get('amount') or r.get('spend') or 0))})" for r in rows[:3])
        window = _fmt_window(tool_resp.get("filters", {}))
        return f"Top merchants{window}: {top}." if top else f"No merchant data{window}."
    if mode == "charts.categories":
        rows = tool_resp.get("result") or []
        top = ", ".join(f"{(r.get('category') or '?')} ({_fmt_usd(float(r.get('spend') or 0))})" for r in rows[:3])
        window = _fmt_window(tool_resp.get("filters", {}))
        return f"Top categories{window}: {top}." if top else f"No category data{window}."
    if mode == "report.link":
        kind = tool_resp.get("meta", {}).get("kind", "report").upper()
        window = _fmt_window(tool_resp.get("filters", {}))
        return f"{kind} export link is ready{window}."
    if mode == "budgets.read":
        return tool_resp.get("message", "Budgets view")
    return "OK"


def _is_trivial_ok(text: str) -> bool:
    t = (text or "").strip().lower()
    t = re.sub(r"[ .!?\u200b]+$", "", t)
    return t in {"ok", "okay"}


def _analytics_intent_from_user(text: str) -> str | None:
    s = (text or "").lower()
    if "anomal" in s:
        return "insights.anomalies"
    if "kpi" in s:
        return "analytics.kpis"
    return None


def _month_str_from_out_or_now(out: dict) -> str:
    m = ((out or {}).get("used_context") or {}).get("month")
    if m:
        return str(m)
    now = utc_now()
    return f"{now.year:04d}-{now.month:02d}"


def _try_llm_rephrase_tool(user_text: str, tool_resp: Dict[str, Any], summary: str) -> Optional[str]:
    # Default off in dev for determinism
    if getattr(settings, "ENV", "dev") != "prod" and getattr(settings, "DEBUG", True):
        return None
    try:
        slim = {
            "mode": tool_resp.get("mode"),
            "filters": tool_resp.get("filters"),
            "preview": (tool_resp.get("result") or [])[:5] if isinstance(tool_resp.get("result"), list) else tool_resp.get("result"),
            "url": tool_resp.get("url"),
        }
        system = (
            "You will rephrase a financial reply that is already CORRECT.\n"
            "Rules:\n"
            "1) DO NOT change any numbers, totals, counts, or date ranges.\n"
            "2) Keep to one short, clear sentence.\n"
            "3) You may refer to links as 'the download link' without changing them.\n"
            "4) Never invent data beyond the provided JSON."
        )
        user = (
            f"User text: {user_text}\n"
            f"Deterministic summary: {summary}\n"
            f"Structured (JSON):\n{json.dumps(slim, ensure_ascii=False)}"
        )
        reply, _ = llm_mod.call_local_llm(
            model=getattr(settings, "DEFAULT_LLM_MODEL", "gpt-oss:20b"),
            messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
            temperature=0.1,
            top_p=0.9,
        )
        text = (reply or "").strip()
        if not text or len(text) > 300:
            return None
        return text
    except Exception:
        return None

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

# Enhanced redirect for legacy GPT chat route with JSON body for better client handling
@router.post("/gpt")  
def deprecated_gpt_chat():
    """Gracefully redirect legacy GPT chat to unified agent endpoint."""
    response = RedirectResponse(url="/agent/chat", status_code=307)
    response.headers["X-Redirect-Reason"] = "Legacy endpoint - use /agent/chat"
    return response

@router.get("/models")
def list_models():
    """
    Returns available models for the current provider (Ollama or OpenAI),
    plus the configured default.
    """
    try:
        info = llm_mod.list_models()
        # Optional: prepend a few convenience aliases the UI can show
        aliases = []
        if info["provider"] == "ollama":
            aliases = [{"id": "gpt-oss:20b"}, {"id": "default"}]
        else:
            aliases = [{"id": "gpt-5"}, {"id": "default"}]
        # De-dup while preserving order
        seen = set()
        merged = []
        for m in (aliases + info["models"]):
            mid = m["id"]
            if mid in seen:
                continue
            seen.add(mid)
            merged.append(m)
        return {
            "provider": info["provider"],
            "default": info["default"],
            "models": merged,
        }
    except Exception as e:
        # Graceful fallback: never 5xx. Provide at least the configured default.
        try:
            provider = getattr(settings, "DEFAULT_LLM_PROVIDER", "ollama")
            default_model = getattr(settings, "DEFAULT_LLM_MODEL", "gpt-oss:20b")
        except Exception:
            provider = "ollama"
            default_model = "gpt-oss:20b"
        # Include convenient aliases similarly to the happy path
        aliases = [{"id": "default"}]
        if provider == "ollama":
            aliases = [{"id": "gpt-oss:20b"}, {"id": "default"}]
        seen = set()
        merged = []
        for m in (aliases + [{"id": default_model}]):
            mid = m.get("id")
            if not mid or mid in seen:
                continue
            seen.add(mid)
            merged.append({"id": mid})
        return {
            "provider": provider,
            "default": default_model,
            "models": merged,
        }

@router.head("/models")
async def head_models():
    """Return 204 for HEAD requests with no-store to avoid probe stampedes."""
    from fastapi import Response
    return Response(status_code=204, headers={"Cache-Control": "no-store"})

# Alternative JSON response for clients that prefer structured redirects
# (Removed duplicate /agent/chat legacy JSON redirect to avoid route conflicts)

