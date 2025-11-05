"""
RAG search abstraction with graceful fallback.

Attempts to use existing RAG search if available, otherwise returns empty results.
"""
import os
from typing import List, Dict, Any

# Try to import existing RAG search implementation
try:
    from app.services.rag_search import search as _existing_search  # type: ignore
except ImportError:
    _existing_search = None

RAG_TOP_K = int(os.getenv("RAG_TOP_K", "6"))
RAG_MIN_SCORE = float(os.getenv("RAG_MIN_SCORE", "0.15"))


def search(query: str, k: int = None, min_score: float = None) -> List[Dict[str, Any]]:
    """
    Search for relevant snippets using RAG.
    
    Args:
        query: Natural language search query
        k: Number of results (default: RAG_TOP_K from env)
        min_score: Minimum relevance score (default: RAG_MIN_SCORE from env)
        
    Returns:
        List of dicts with {text, url?, score?, meta?}
        Empty list if RAG not configured or no results found
    """
    if k is None:
        k = RAG_TOP_K
    if min_score is None:
        min_score = RAG_MIN_SCORE
        
    if _existing_search is None:
        # RAG not configured - graceful fallback
        return []
    
    try:
        hits = _existing_search(query=query, k=k) or []
        
        # Normalize result format
        results = []
        for hit in hits:
            # Handle different possible response formats
            text = hit.get("text") or hit.get("chunk") or hit.get("content") or ""
            if not text:
                continue
                
            score = hit.get("score")
            if score is not None and score < min_score:
                continue
                
            normalized = {
                "text": text,
                "url": hit.get("url"),
                "score": score if score is not None else 1.0,
                "meta": hit.get("meta", {}),
            }
            results.append(normalized)
            
        return results[:k]
        
    except Exception:
        # Any error in RAG search - graceful fallback
        return []
