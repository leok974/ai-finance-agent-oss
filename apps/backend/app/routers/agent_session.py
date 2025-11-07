"""
Agent session management endpoints.
Handles session reset and cleanup operations.
"""
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Optional

from app.utils.auth import get_current_user
from app.orm_models import User

router = APIRouter(prefix="/agent/session", tags=["agent-session"])


class ResetSessionPayload(BaseModel):
    prev_session_id: Optional[str] = None
    next_session_id: Optional[str] = None


@router.post("/reset")
async def reset_session(
    payload: ResetSessionPayload,
    user: User = Depends(get_current_user)
):
    """
    Reset agent session - clears server-side state for a session.
    
    This endpoint allows clients to signal that they're starting a fresh session.
    The backend can use this to:
    - Drop any per-session tool state
    - Clear RAG context caches
    - Evict session memories
    - Reset conversation state
    
    Args:
        payload: Contains prev_session_id (to clean up) and next_session_id (new session)
        user: Authenticated user from JWT
        
    Returns:
        Confirmation with session IDs
    """
    prev = payload.prev_session_id
    nxt = payload.next_session_id
    
    # TODO: Implement actual session cleanup logic here
    # Examples:
    # - agent_sessions.pop(prev, None)
    # - rag_ctx.evict(prev)
    # - conversation_memory.clear(user.id, prev)
    # - tool_state_cache.delete(prev)
    
    return {
        "ok": True,
        "prev": prev,
        "next": nxt,
        "message": "Session reset successfully",
        "user_id": str(user.id)
    }
