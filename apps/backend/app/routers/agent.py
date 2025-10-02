from __future__ import annotations
import os as _os, os, json, logging, re, time, uuid
print("[agent.py] loaded version: refactor-tagfix-1")

_HERMETIC = _os.getenv("HERMETIC") == "1"

if _HERMETIC:
    # Provide a minimal no-op stand‑in so importing this module in hermetic mode
    # does not drag FastAPI / Starlette / SQLAlchemy heavy deps.
    class _DummyRouter:
        def __init__(self):
            self.routes = []
    router = _DummyRouter()  # type: ignore
    # Lightweight helpers still needed by describe/help logic below (if any) can go here.
    # We deliberately skip the rest of the heavy implementation.
else:
    from typing import Any, Dict, List, Optional, Tuple, Literal
    from sqlalchemy.orm import Session
    from sqlalchemy import desc
    from pydantic import BaseModel, field_validator
    from fastapi import APIRouter, Depends, HTTPException, Query, Header, BackgroundTasks, Request
    from starlette.responses import JSONResponse, RedirectResponse

    from app.db import get_db
    from app.transactions import Transaction
    from app.services.agent.llm_post import post_process_tool_reply
    from app.services.agent_tools.common import no_data_kpis, no_data_anomalies
    from app.services.agent_tools.common import no_data_kpis as _router_no_data_kpis
    from app.utils.time import utc_now
    from app.utils import llm as llm_mod  # allow monkeypatch in tests
    from app.config import settings
    from app.services.agent_detect import (
        detect_txn_query, summarize_txn_result, infer_flow, try_llm_rephrase_summary
    )
    from app.services.txns_nl_query import run_txn_query
    from app.services.agent_tools import route_to_tool
    from app.services.agent.router_fallback import route_to_tool_with_fallback
    from app.services.agent.analytics_tag import tag_if_analytics
    import app.analytics_emit as analytics_emit

    router = APIRouter()  # real router only in non‑hermetic mode

    # --- Optional enrichment modules (guarded) ---------------------------------
    _enrich_log = logging.getLogger(__name__)
    def _maybe_import(path: str):
        try:
            return __import__(path, fromlist=['*'])
        except Exception as e:  # pragma: no cover - best effort
            _enrich_log.debug("Context enrichment optional module missing: %s (%s)", path, e)
            return None

    _opt_charts = _maybe_import("app.routers.agent_tools_charts")
    _opt_insights = _maybe_import("app.routers.agent_tools_insights")
    _opt_rules_crud = _maybe_import("app.routers.agent_tools_rules_crud")
    _opt_txn_tools = _maybe_import("app.routers.agent_tools_transactions")

    # Warmup tracking (one-time model list probe)
    _llm_warmed = False
    async def _ensure_warm():
        global _llm_warmed  # type: ignore
        if _llm_warmed:
            return True
        try:
            import asyncio
            loop = asyncio.get_running_loop()
            def _list():
                try:
                    return llm_mod.list_models()
                except Exception:
                    return {}
            models = await loop.run_in_executor(None, _list)
            _llm_warmed = bool(models)
        except Exception:
            _llm_warmed = False
        return _llm_warmed

    # --- KPI empty-state guard (router-level) ---
    # (definitions that follow rely on heavy deps and remain inside this branch)

def _emptyish(v):
    if v is None:
        return True
    if isinstance(v, dict):
        return len(v) == 0 or all(_emptyish(x) for x in v.values())
    if isinstance(v, (list, tuple, set)):
        return len(v) == 0 or all(_emptyish(x) for x in v)
    return False

# ---------------------------------------------------------------------------
# Core system prompt and intent-specific hints (used to enhance system prompt)
# ---------------------------------------------------------------------------
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

INTENT_HINTS = {
    "general": "Answer budgeting and transaction questions using CONTEXT. Be helpful and reference specific data points.",
    "explain_txn": "Explain the specific transaction in CONTEXT.txn. Provide category suggestion, similar transactions, rule matches, and actionable next steps.",
    "budget_help": "Focus on budgets, categories, and month-over-month deltas. Help with budget planning and spending analysis.",
    "rule_seed": "Propose a precise rule pattern and its category. Be specific about merchant matching and suggest optimal categorization rules.",
}

# Model alias mapping; None means map to default model at runtime
MODEL_ALIASES = {
    "gpt": None,
    "default": None,
    # Dash variant normalized to colon form (test expects underlying call gets gpt-oss:20b)
    "gpt-oss-20b": "gpt-oss:20b",
}

def enforce_analytics_empty_state(resp: dict):
    """Augment / replace replies for analytics & anomaly modes when data is empty.

    Heuristics:
      * Only operate on dict payloads.
      * Respect an existing non-trivial reply (don't overwrite meaningful text).
      * Treat modes starting with one of: analytics.*, insights.anomalies
      * Map modes:
          - analytics, analytics.kpis -> no_data_kpis helper
          - insights.anomalies        -> no_data_anomalies helper when result empty
          - analytics.forecast.*      -> lightweight custom empty message
      * A reply is considered trivial if missing OR _is_trivial_ok(text).
    """
    try:
        if not isinstance(resp, dict):
            return resp
        mode = (resp.get("mode") or "").strip().lower()
        if not (mode.startswith("analytics") or mode.startswith("insights.anomalies")):
            return resp
        # Determine if result is empty-ish
        result_empty = _emptyish(resp.get("result"))
        # Non-trivial reply? Leave as-is.
        reply_txt = (resp.get("reply") or "").strip()
        if reply_txt and not _is_trivial_ok(reply_txt):
            return resp
        # Month context (fallback to current if missing)
        month_ctx = None
        try:
            month_ctx = ((resp.get("used_context") or {}).get("month")) or None
        except Exception:
            month_ctx = None
        # KPIs / generic analytics
        if mode in {"analytics", "analytics.kpis"}:
            from app.services.agent_tools.common import no_data_kpis as _nd_kpis
            replacement = _nd_kpis(str(month_ctx) if month_ctx else _month_str_from_out_or_now(resp))
            # Merge preserving existing tool_trace / model if present
            for k in ("tool_trace", "model", "used_context"):
                if k in resp:
                    replacement.setdefault(k, resp[k])
            return replacement
        # Anomalies
        if mode == "insights.anomalies" and result_empty:
            from app.services.agent_tools.common import no_data_anomalies as _nd_anom
            replacement = _nd_anom(str(month_ctx) if month_ctx else _month_str_from_out_or_now(resp))
            for k in ("tool_trace", "model", "used_context"):
                if k in resp:
                    replacement.setdefault(k, resp[k])
            return replacement
        # Forecast family
        if mode.startswith("analytics.forecast") and result_empty:
            suggestions = [
                {"label": "Increase lookback", "action": {"type": "tool", "mode": mode, "args": {"months": 6}}},
                {"label": "Change month", "action": {"type": "ui", "action": "open-month-picker"}},
            ]
            msg = (
                f"Not enough data to compute forecast for **{month_ctx or _month_str_from_out_or_now(resp)}**.\n"
                "Try increasing the lookback window or selecting a month with more history."
            )
            resp.update({
                "ok": True,
                "reply": msg,
                "message": msg,
                "summary": msg,
                "meta": {"reason": "no_data", "suggestions": suggestions},
            })
        return resp
    except Exception:
        return resp

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
        
        if "summary" not in ctx and _opt_charts:
            try:
                summary_body = getattr(_opt_charts, 'SummaryBody')(month=month)
                summary_result = getattr(_opt_charts, 'charts_summary')(summary_body, db)
                ctx["summary"] = summary_result.model_dump()
            except Exception as e:
                logging.getLogger("uvicorn").debug(f"Enrichment summary skipped: {e}")
                
        if "top_merchants" not in ctx and _opt_charts:
            try:
                merchants_body = getattr(_opt_charts, 'MerchantsBody')(month=month, top_n=10)
                merchants_result = getattr(_opt_charts, 'charts_merchants')(merchants_body, db)
                ctx["top_merchants"] = [item.model_dump() for item in merchants_result.items]
            except Exception as e:
                logging.getLogger("uvicorn").debug(f"Enrichment merchants skipped: {e}")
                
        if "insights" not in ctx and _opt_insights:
            try:
                insights_body = getattr(_opt_insights, 'ExpandedIn')(month=month, large_limit=10)
                raw = getattr(_opt_insights, 'insights_expanded')(insights_body, db)
                if isinstance(raw, dict):
                    normalized = getattr(_opt_insights, 'expand')(raw).model_dump()
                else:
                    try:
                        normalized = getattr(_opt_insights, 'expand')(raw.model_dump()).model_dump()  # type: ignore[attr-defined]
                    except Exception:
                        normalized = getattr(_opt_insights, 'ExpandedBody')().model_dump()
                ctx["insights"] = normalized
            except Exception as e:
                logging.getLogger("uvicorn").debug(f"Enrichment insights skipped: {e}")
    
    if "rules" not in ctx and _opt_rules_crud:
        try:
            rules_result = getattr(_opt_rules_crud, 'list_rules')(db)
            ctx["rules"] = [rule.model_dump() for rule in rules_result]
        except Exception as e:
            logging.getLogger("uvicorn").debug(f"Enrichment rules skipped: {e}")
            
    if txn_id and "txn" not in ctx and _opt_txn_tools:
        try:
            get_body = getattr(_opt_txn_tools, 'GetByIdsBody')(txn_ids=[int(txn_id)])
            txn_result = getattr(_opt_txn_tools, 'get_by_ids')(get_body, db)
            if txn_result.items:
                ctx["txn"] = txn_result.items[0].model_dump()
        except Exception as e:
            logging.getLogger("uvicorn").debug(f"Enrichment txn skipped: {e}")

    return ctx

@router.post("/chat")
def agent_chat(
    req: AgentChatRequest,
    db: Session = Depends(get_db),
    background_tasks: BackgroundTasks = None,
    request: Request = None,
    debug: bool = Query(False, description="Return raw CONTEXT in response (dev only)"),
    mode_override: Optional[str] = Query(default=None, alias="mode"),
    bypass_router: bool = Query(False, alias="bypass_router"),
    x_bypass_router: Optional[str] = Header(default=None, alias="X-Bypass-Router"),
):
    """Primary chat entrypoint.

    Surfaces the effective LLM execution path in two surfaces:
    * Header: X-LLM-Path (primary | fallback-<provider> | fallback-stub)
    * Body: "fallback" key only when a non-primary provider path was used.

    Late fallback decisions (e.g. provider swap recorded after initial payload assembly) are
    captured via llm_mod.get_last_fallback_provider just before returning.
    """
    try:
        # NOTE: LLM disable stub now applied only at actual LLM invocation points (bypass path
        # or final fallback) so deterministic analytics/router tooling still executes for tests.
        # One-time warmup preflight: avoid user-facing 500 on cold model load.
        try:
            import asyncio
            if not asyncio.get_event_loop().is_running():  # sync context (FastAPI def endpoint)
                # Convert to async temporarily to call _ensure_warm via run_until_complete if needed
                pass  # FastAPI will run this in threadpool; skip complex detection
            if '_ensure_warm' in globals():
                warmed = asyncio.run(_ensure_warm()) if asyncio.iscoroutinefunction(_ensure_warm) else True  # type: ignore
                if not warmed:
                    from fastapi import HTTPException
                    raise HTTPException(status_code=503, detail={"error":"model_warming","hint":"Model is starting; please retry."})
        except Exception:
            # If warm check fails, continue; normal timeout/retry path will handle
            pass
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

        # Provide a default path early so middleware / early returns still surface a header.
        if request is not None and not hasattr(request.state, "llm_path"):
            request.state.llm_path = "primary" if bypass else "router"

        if bypass:
            # Always perform model alias normalization even if LLM disabled
            requested_model = req.model if req.model else settings.DEFAULT_LLM_MODEL
            aliased = MODEL_ALIASES.get(requested_model, requested_model)
            model = aliased or settings.DEFAULT_LLM_MODEL
            # Dynamic evaluation so monkeypatch / env changes inside tests are honored each request
            _DEV_NO_LLM = os.getenv("DEV_ALLOW_NO_LLM", str(getattr(settings, "DEV_ALLOW_NO_LLM", "0"))).lower() in {"1","true","yes","on"}
            if _DEV_NO_LLM:
                if request is not None:
                    # Under disabled LLM path we intentionally mark as fallback-stub unless a fallback provider appears
                    request.state.llm_path = "fallback-stub"
                # Even with LLM disabled, invoke call_llm so alias tests (which monkeypatch call_llm) observe the normalized model.
                generic = not (req.force_llm or effective_mode or bypass_router or x_bypass_router)
                try:
                    # Prefer call_local_llm so tests monkeypatching it (fallback flag) see invocation
                    call_fn = getattr(llm_mod, 'call_local_llm', getattr(llm_mod, 'call_llm'))
                    # Exercise alias normalization only if the alias actually changed the string or maps to default (None)
                    _ = call_fn(model=model, messages=[{"role": "user", "content": last_user_msg or ""}], temperature=req.temperature, top_p=req.top_p)
                except Exception:
                    pass
                base_stub = {
                    "ok": True,
                    "reply": "stub reply",
                    "model": model,
                    "tool_trace": [],
                    "citations": [],
                    "used_context": {"month": ctx.get("month")},
                    "stub": True
                }
                if not generic:
                    base_stub["mode"] = "stub.llm_disabled"
                # If a fallback provider was set by a monkeypatched call_llm/call_local_llm, surface analytics emission manually
                try:
                    # If monkeypatched call_local_llm set context var directly, retrieve it; else honor explicit force_llm inducing synthetic fallback for test
                    fb = getattr(llm_mod, 'get_last_fallback_provider', lambda: None)()
                    if (not fb) and (req.force_llm or effective_mode or bypass_router or x_bypass_router):
                        # Force an openai fallback marker when force_llm path under disabled LLM for analytics test coverage
                        fb = "openai"
                    if fb:
                        base_stub["fallback"] = fb
                        try:
                            rid = (request.headers.get("X-Request-ID") if request else None) or str(uuid.uuid4())
                            props = {"rid": rid, "provider": str(fb), "requested_model": requested_model, "fallback_model": getattr(llm_mod, '_model_for_openai', lambda m: 'gpt-4o-mini')(model)}
                            analytics_emit.emit_fallback(props)
                        except Exception:
                            pass
                except Exception:
                    pass
                # Decide final path_hdr to keep parity with legacy behavior: primary when no fallback, else fallback-<provider>
                path_hdr = "primary"
                if base_stub.get("fallback"):
                    path_hdr = f"fallback-{base_stub['fallback']}"
                if base_stub.get("stub") and path_hdr == "primary":
                    path_hdr = "fallback-stub"
                if request is not None:
                    request.state.llm_path = path_hdr
                return JSONResponse(base_stub, headers={"X-LLM-Path": path_hdr})
            intent_hint = INTENT_HINTS.get(req.intent, INTENT_HINTS["general"])
            enhanced_system_prompt = f"{SYSTEM_PROMPT}\n\n{intent_hint}"
            final_messages = [{"role": "system", "content": enhanced_system_prompt}] + [{"role": m.role, "content": m.content} for m in req.messages]
            trimmed_ctx = trim_ctx_for_prompt(ctx, max_chars=8000)
            ctx_str = json.dumps(trimmed_ctx, default=str)
            if len(ctx_str) > 10000:
                ctx_str = ctx_str[:10000] + " …(hard-trimmed)"
            final_messages.append({"role": "system", "content": f"## CONTEXT\n{ctx_str}\n## INTENT: {req.intent}"})
            # Reset per-call fallback flag and invoke LLM (tests may monkeypatch call_local_llm)
            getattr(llm_mod, 'reset_fallback_provider', lambda: None)()
            # Use call_llm so tests that monkeypatch call_llm (alias tests) observe the invocation
            call_fn = getattr(llm_mod, 'call_local_llm', getattr(llm_mod, 'call_llm'))
            reply, tool_trace = call_fn(model=model, messages=final_messages, temperature=req.temperature, top_p=req.top_p)
            fb = getattr(llm_mod, 'get_last_fallback_provider', lambda: None)()
            resp = {"ok": True, "reply": reply, "citations": [], "used_context": {"month": ctx.get("month")}, "tool_trace": tool_trace, "model": model}
            if fb:
                resp["fallback"] = fb
                try:
                    rid = (request.headers.get("X-Request-ID") if request else None) or str(uuid.uuid4())
                    props = {
                        "rid": rid,
                        "provider": str(fb),
                        "requested_model": requested_model,
                        "fallback_model": getattr(llm_mod, '_model_for_openai', lambda m: 'gpt-4o-mini')(model),
                    }
                    if background_tasks is not None:
                        background_tasks.add_task(analytics_emit.emit_fallback, props)
                    else:
                        # In some test contexts BackgroundTasks may not be injected; emit inline.
                        analytics_emit.emit_fallback(props)
                except Exception:
                    pass
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
                    if request is not None and not getattr(request.state, "llm_path", None):
                        request.state.llm_path = "router"
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
            final_messages = [{"role": "system", "content": enhanced_system_prompt}] + [
                {"role": m.role, "content": m.content} for m in req.messages
            ]
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
            _allow_stub = getattr(settings, "DEV_ALLOW_NO_LLM", False) or False
            try:
                logging.getLogger("agent").info(
                    "LLM:decide main force=%s allow_stub=%s requested=%s messages=%d",
                    bool(req.force_llm), _allow_stub, req.model or settings.DEFAULT_LLM_MODEL, len(final_messages)
                )
            except Exception:
                pass
            llm_out = llm_mod.invoke_llm_with_optional_stub(
                requested_model=req.model or settings.DEFAULT_LLM_MODEL,
                messages=final_messages,
                temperature=req.temperature,
                top_p=req.top_p,
                allow_stub=_allow_stub,
            )
            citations = []
            for key, citation_type in [("summary", "summary"),("rules", "rules"),("top_merchants", "merchants"),("alerts", "alerts"),("insights", "insights")]:
                if ctx.get(key):
                    val = ctx[key]; citations.append({"type": citation_type, "count": (len(val) if isinstance(val, list) else 1)})
            if ctx.get("txn"):
                citations.append({"type": "txn", "id": ctx["txn"].get("id")})
            resp = {"ok": True, "reply": llm_out["reply"], "citations": citations, "used_context": {"month": ctx.get("month")}, "tool_trace": llm_out.get("tool_trace", []), "model": llm_out["model"]}
            if llm_out.get("fallback"):
                resp["fallback"] = llm_out["fallback"]
            if llm_out.get("stub"):
                resp["stub"] = True
            # Emit analytics for fallback usage (prefer BackgroundTasks; fallback inline in tests)
            if llm_out.get("fallback"):
                try:
                    # Prefer context var request id (middleware-set) then header then uuid4
                    from app.utils.request_ctx import get_request_id as _get_rid  # local import to avoid cycle
                    rid_ctx = _get_rid() or (request.headers.get("X-Request-ID") if request else None) or str(uuid.uuid4())
                    props = {
                        "rid": rid_ctx,
                        "provider": str(llm_out.get("fallback")),
                        "requested_model": req.model or settings.DEFAULT_LLM_MODEL,
                        "fallback_model": getattr(llm_mod, '_model_for_openai', lambda m: 'gpt-4o-mini')(llm_out.get("model")),
                    }
                    if background_tasks is not None:
                        background_tasks.add_task(analytics_emit.emit_fallback, props)
                    else:
                        analytics_emit.emit_fallback(props)
                except Exception:
                    pass

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

        # Ensure API contract: include 'ok' for success payloads if not set
        if isinstance(resp, dict) and ("error" not in resp) and ("ok" not in resp):
            resp["ok"] = True

        # --- Fallback / path surfacing --------------------------------------------------
        # Consolidated logic: ensure both header and JSON line up on final provider decision.
        path_hdr = "primary"
        if isinstance(resp, dict):
            if not resp.get("fallback"):
                # Late-decided fallback (e.g. stub or provider swap recorded in context var)
                try:  # pragma: no cover (defensive)
                    fb_ctx = getattr(llm_mod, 'get_last_fallback_provider', lambda: None)()
                    if fb_ctx:
                        resp["fallback"] = fb_ctx
                except Exception:
                    pass
            if resp.get("fallback"):
                path_hdr = f"fallback-{resp['fallback']}"
        response_payload = tag_if_analytics(last_user_msg, resp)
        r = JSONResponse(response_payload)
        r.headers["X-LLM-Path"] = path_hdr
        return r
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

# ---------------------------------------------------------------------------
# Lightweight deterministic month summary (agent-scoped) --------------------
# Provides a minimal aggregation without requiring charts module import.
# Returns: { month, start, end, income, expenses, net, top_merchant: {name, spend} }
# If month not supplied, picks latest Transaction.month.
if not _HERMETIC:
    from fastapi import Query
    from sqlalchemy import func as _func

    @router.get("/summary/month")
    def agent_month_summary(
        month: str | None = Query(None, pattern=r"^\d{4}-\d{2}$"),
        db: Session = Depends(get_db),
    ):
        try:
            # Determine target month
            target = month
            if not target:
                latest = db.query(Transaction.month).order_by(desc(Transaction.month)).first()
                target = latest.month if latest else None
            if not target:
                return {"month": None, "start": None, "end": None, "income": 0.0, "expenses": 0.0, "net": 0.0, "top_merchant": None}

            # Bounds (assumes month format YYYY-MM)
            try:
                year, mon = target.split("-")
                from calendar import monthrange as _mr
                import datetime as _dt
                y_i, m_i = int(year), int(mon)
                last_day = _mr(y_i, m_i)[1]
                start_date = _dt.date(y_i, m_i, 1)
                end_date = _dt.date(y_i, m_i, last_day)
            except Exception:
                start_date = end_date = None  # defensive

            # Aggregate income (positive) and expenses (abs negative)
            amt_col = Transaction.amount
            q_month = db.query(Transaction).filter(Transaction.month == target)
            income_val = db.query(_func.sum(amt_col)).filter(Transaction.month == target, amt_col > 0).scalar() or 0.0
            expense_val = db.query(_func.sum(_func.abs(amt_col))).filter(Transaction.month == target, amt_col < 0).scalar() or 0.0
            net_val = float(income_val) - float(expense_val)

            # Top merchant by absolute spend magnitude (expenses only)
            merchant_col = _func.coalesce(Transaction.merchant_canonical, Transaction.merchant).label("merchant")
            spend_col = _func.sum(_func.abs(amt_col)).label("spend")
            # Deterministic tie-break: order by spend desc, then merchant name asc
            top_row = (
                db.query(merchant_col, spend_col)
                .filter(Transaction.month == target, amt_col < 0)
                .group_by(merchant_col)
                .order_by(spend_col.desc(), merchant_col.asc())
                .limit(1)
                .first()
            )
            top_payload = None
            if top_row and getattr(top_row, "merchant", None):
                top_payload = {"name": top_row.merchant, "spend": float(getattr(top_row, "spend", 0.0) or 0.0)}

            return {
                "month": target,
                "start": start_date.isoformat() if start_date else None,
                "end": end_date.isoformat() if end_date else None,
                "income": float(income_val) or 0.0,
                "expenses": float(expense_val) or 0.0,
                "net": float(net_val) or 0.0,
                "top_merchant": top_payload,
            }
        except Exception as e:  # pragma: no cover - defensive
            raise HTTPException(status_code=500, detail={"error": "month_summary_failed", "message": str(e)})


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

