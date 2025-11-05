from fastapi import APIRouter
import time

router = APIRouter(prefix="/api", tags=["metrics"])

_start_time = time.time()


@router.get("/metrics")
def metrics():
    """Lightweight metrics endpoint for diagnostics."""
    uptime = int(time.time() - _start_time)
    return {"ok": True, "uptime_s": uptime}
