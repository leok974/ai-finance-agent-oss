from fastapi import APIRouter

router = APIRouter(prefix="/agent/plan", tags=["agent-plan"])


@router.get("/status")
def status():
    return {"ok": False, "status": "not_implemented"}
