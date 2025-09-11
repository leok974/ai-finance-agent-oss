from fastapi import APIRouter

router = APIRouter(prefix="/agent/plan", tags=["agent-plan"])


@router.get("/status")
def plan_status():
    # minimal stub so UI stops 404-ing
    return {
        "ok": True,
        "enabled": False,          # flip to True if you wire a real planner later
        "status": "unavailable",   # or "idle"
        "reason": "not_implemented",
    }
