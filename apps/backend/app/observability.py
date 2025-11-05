from fastapi import APIRouter, Response
from prometheus_client import Counter, CONTENT_TYPE_LATEST, generate_latest

# Counter for legacy compat endpoints
compat_hits = Counter(
    "compat_endpoint_hits_total",
    "Hits to legacy /api/* compat endpoints",
    ["path", "source"],  # source ∈ {client, probe}
)

metrics_router = APIRouter()


@metrics_router.get("/metrics")
async def metrics() -> Response:  # pragma: no cover simple exposition
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)
