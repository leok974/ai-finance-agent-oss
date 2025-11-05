from fastapi import APIRouter, Response

try:  # pragma: no cover - metrics optional path
    from prometheus_client import generate_latest, CONTENT_TYPE_LATEST  # type: ignore

    _PROM = True
except Exception:  # pragma: no cover
    _PROM = False

router = APIRouter()


@router.get("/metrics")
async def metrics():  # pragma: no cover - trivial wiring
    if _PROM:
        return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)  # type: ignore
    # Fallback: expose minimal counters if defined in csp module
    total = 0
    inline = {"style": 0, "script": 0, "attr": 0}
    try:
        from app.routes import csp  # type: ignore

        total = getattr(csp, "_CSP_COUNT", 0)  # type: ignore
        inline = getattr(csp, "_CSP_INLINE", inline)  # type: ignore
    except Exception:
        pass
    lines = [
        f"csp_reports_total_fallback {total}",
        f"csp_inline_total_fallback{{kind=\"style\"}} {inline.get('style',0)}",
        f"csp_inline_total_fallback{{kind=\"script\"}} {inline.get('script',0)}",
        f"csp_inline_total_fallback{{kind=\"attr\"}} {inline.get('attr',0)}",
    ]
    # Append edge metrics if available (ingestion fallback)
    try:
        from app.routes.edge_metrics import get_edge_fallback_metrics  # type: ignore

        lines.extend(get_edge_fallback_metrics())  # type: ignore
    except Exception:
        pass
    return Response("\n".join(lines) + "\n", media_type="text/plain; charset=utf-8")
