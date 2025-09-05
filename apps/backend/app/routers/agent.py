from __future__ import annotations
import json
import re
import logging
from typing import Any, Dict, List, Optional, Tuple, Literal

from fastapi import APIRouter, Depends, HTTPException
from starlette.responses import JSONResponse, RedirectResponse
from sqlalchemy.orm import Session
from sqlalchemy import desc
from pydantic import BaseModel, field_validator

from app.db import get_db
from app.orm_models import Transaction

# Import existing agent tools endpoints
from app.routers import agent_tools_charts, agent_tools_budget, agent_tools_insights 
from app.routers import agent_tools_transactions, agent_tools_rules_crud, agent_tools_meta

from app.utils import llm as llm_mod  # <-- import module so tests can monkeypatch llm_mod.call_local_llm

router = APIRouter()  # <-- no prefix here (main.py supplies /agent)

# Model name normalization
MODEL_ALIASES = {
    "gpt-oss:20b": "gpt-oss-20b",
    "gpt-oss-20b": "gpt-oss-20b",
}

# Sensitive keys for PII redaction in logs

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
                ctx["summary"] = summary_result.dict()
            except Exception as e:
                print(f"Error enriching summary: {redact_pii(str(e))}")
                
        if "top_merchants" not in ctx:
            try:
                merchants_body = agent_tools_charts.MerchantsBody(month=month, top_n=10)
                merchants_result = agent_tools_charts.charts_merchants(merchants_body, db)
                ctx["top_merchants"] = [item.dict() for item in merchants_result.items]
            except Exception as e:
                print(f"Error enriching merchants: {redact_pii(str(e))}")
                
        if "insights" not in ctx:
            try:
                insights_body = agent_tools_insights.ExpandedBody(month=month)
                insights_result = agent_tools_insights.insights_expanded(insights_body, db)
                ctx["insights"] = insights_result.dict()
            except Exception as e:
                print(f"Error enriching insights: {redact_pii(str(e))}")
    
    if "rules" not in ctx:
        try:
            rules_result = agent_tools_rules_crud.list_rules(db)
            ctx["rules"] = [rule.dict() for rule in rules_result]
        except Exception as e:
            print(f"Error enriching rules: {redact_pii(str(e))}")
            
    if txn_id and "txn" not in ctx:
        try:
            get_body = agent_tools_transactions.GetByIdsBody(txn_ids=[int(txn_id)])
            txn_result = agent_tools_transactions.get_by_ids(get_body, db)
            if txn_result.items:
                ctx["txn"] = txn_result.items[0].dict()
        except Exception as e:
            print(f"Error enriching transaction: {redact_pii(str(e))}")

    return ctx

@router.post("/chat")
def agent_chat(req: AgentChatRequest, db: Session = Depends(get_db)):
    try:
        # Log request (with PII redacted)
        print(f"Agent chat request: {redact_pii(req.dict())}")
        
        # Normalize model name
        model = MODEL_ALIASES.get(req.model, req.model) if req.model else "gpt-oss-20b"
        
        ctx = _enrich_context(db, req.context, req.txn_id)
        
        # Fallback for explain_txn intent when txn_id is missing
        if req.intent == "explain_txn" and not req.txn_id and "txn" not in ctx:
            # Try to parse transaction info from the last user message
            if req.messages:
                last_user_msg = next((msg.content for msg in reversed(req.messages) if msg.role == "user"), "")
                parsed_info = parse_txn_from_message(last_user_msg)
                if parsed_info:
                    # Try to find matching transaction based on parsed info
                    # For now, just log the parsed info and fall back to latest
                    print(f"Parsed transaction info from message: {parsed_info}")
            
            # Fallback: pick the most recent transaction for current month
            if ctx.get("month"):
                fallback_txn = latest_txn_for_month(db, ctx["month"])
                if fallback_txn:
                    ctx["txn"] = fallback_txn
                    print(f"Using fallback transaction: {redact_pii(fallback_txn)}")

        # Build final prompt for local model with intent-specific hints
        intent_hint = INTENT_HINTS.get(req.intent, INTENT_HINTS["general"])
        enhanced_system_prompt = f"{SYSTEM_PROMPT}\n\n{intent_hint}"
        
        final_messages = [{"role": "system", "content": enhanced_system_prompt}]
        final_messages.extend([{"role": msg.role, "content": msg.content} for msg in req.messages])

        # Smart context trimming that preserves most important data
        trimmed_ctx = trim_ctx_for_prompt(ctx, max_chars=8000)
        ctx_str = json.dumps(trimmed_ctx, default=str)
        
        # Final safety check with hard limit
        if len(ctx_str) > 10000:
            ctx_str = ctx_str[:10000] + " …(hard-trimmed)"
            
        final_messages.append({"role":"system","content": f"## CONTEXT\n{ctx_str}\n## INTENT: {req.intent}"})

        # Log context size (for monitoring)
        original_size = len(json.dumps(ctx, default=str))
        trimmed_size = len(ctx_str)
        original_tokens = estimate_tokens(json.dumps(ctx, default=str))
        trimmed_tokens = estimate_tokens(ctx_str)
        
        if original_size != trimmed_size:
            print(f"Context trimmed: {original_size} → {trimmed_size} chars (~{original_tokens} → {trimmed_tokens} tokens)")
        else:
            print(f"Context size: {trimmed_size} chars (~{trimmed_tokens} tokens)")

        reply, tool_trace = llm_mod.call_local_llm(
            model=model,
            messages=final_messages,
            temperature=req.temperature,
            top_p=req.top_p,
        )

        # Comprehensive citations summary with richer context information
        citations = []
        
        # Use mapping for consistent citation generation
        for key, citation_type in [
            ("summary", "summary"),
            ("rules", "rules"), 
            ("top_merchants", "merchants"),
            ("alerts", "alerts"),
            ("insights", "insights"),
        ]:
            if ctx.get(key):
                val = ctx[key]
                count = len(val) if isinstance(val, list) else 1
                citations.append({"type": citation_type, "count": count})
        
        # Transaction gets special treatment with ID
        if ctx.get("txn"): 
            citations.append({"type": "txn", "id": ctx["txn"].get("id")})

        return JSONResponse({
            "reply": reply,
            "citations": citations,
            "used_context": {"month": ctx.get("month")},
            "tool_trace": tool_trace,
            "model": model,
        })
        
    except Exception as e:
        # Log error (with PII redacted)
        print(f"Agent chat error: {str(e)}")
        print(f"Request context: {redact_pii(req.dict() if hasattr(req, 'dict') else {})}")
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

# Enhanced redirect for legacy GPT chat route with JSON body for better client handling
@router.post("/gpt")  
def deprecated_gpt_chat():
    """Gracefully redirect legacy GPT chat to unified agent endpoint."""
    response = RedirectResponse(url="/agent/chat", status_code=307)
    response.headers["X-Redirect-Reason"] = "Legacy endpoint - use /agent/chat"
    return response

# Alternative JSON response for clients that prefer structured redirects
@router.post("/chat")
def deprecated_chat():
    """Alternative legacy redirect with JSON response."""
    return JSONResponse(
        status_code=301,
        content={
            "error": "This endpoint has moved",
            "new_url": "/agent/chat",
            "message": "Please update your client to use /agent/chat for unified agent functionality"
        }
    )
