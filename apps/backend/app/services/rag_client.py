"""
RAG client for contextual help explanations.

Attempts to use RAG search + LLM to generate explanations.
Falls back to snippet extraction if LLM unavailable.
"""
import os
import time
from typing import List, Dict, Any
from app.metrics_ml import lm_help_rag_total, lm_help_rag_latency_seconds
from app.services import rag as rag_lib
from app.services.prompts import help_prompts as HP

# Use the RAG shim which handles graceful fallback
rag_search = rag_lib.search

# Optional LLM provider (if you have one). Otherwise we'll synthesize text from snippets.
try:
    from app.providers.llm import complete  # def complete(prompt:str, **kw) -> str
except Exception:
    complete = None

HELP_USE_RAG = os.getenv("HELP_USE_RAG", "1") not in ("0", "false", "False")
RAG_TOP_K = int(os.getenv("RAG_TOP_K", "6"))


def explain_with_rag(
    query: str, 
    context_bullets: List[str], 
    panel_id: str = "", 
    month: str = "", 
    k: int = None
) -> str:
    """
    Attempt to generate explanation using RAG search + LLM.
    
    Args:
        query: Natural language question to search for
        context_bullets: List of context strings (what, month, merchants, etc.)
        panel_id: Panel identifier for selecting appropriate prompt template
        month: Month string (YYYY-MM) for context
        k: Number of search results to retrieve (default: RAG_TOP_K from env)
        
    Returns:
        Generated explanation text, or empty string if RAG unavailable/failed
    """
    if k is None:
        k = RAG_TOP_K
        
    start = time.time()
    
    if not HELP_USE_RAG:
        lm_help_rag_total.labels(status="miss").inc()
        return ""

    try:
        hits: List[Dict[str, Any]] = rag_search(query=query, k=k) or []
        if not hits:
            lm_help_rag_total.labels(status="miss").inc()
            return ""

        # Build snippets and context
        snippets = "\n\n".join(
            f"- {h.get('text', '')[:600]}" for h in hits[:k]
        )
        bullets = "\n".join(f"- {b}" for b in context_bullets)
        
        # Select appropriate template for this panel
        template = HP.PROMPT_BY_PANEL.get(panel_id, HP.TEMPLATE_GENERIC)
        prompt = template.format(
            context_bullets=bullets,
            snippets=snippets,
            month=month or "this month"
        )

        if complete:
            # Combine system message with prompt
            full_prompt = f"{HP.BASE_SYSTEM}\n\n{prompt}"
            txt = complete(full_prompt, max_tokens=220)
            lm_help_rag_total.labels(status="hit").inc()
            return txt.strip()

        # No LLM? Return a stitched extract
        lm_help_rag_total.labels(status="llm_fallback").inc()
        extracted = " ".join(h.get("text", "")[:300] for h in hits[:3]).strip()
        return (extracted or "").strip()

    except Exception:
        lm_help_rag_total.labels(status="err").inc()
        return ""
    finally:
        lm_help_rag_latency_seconds.observe(time.time() - start)
