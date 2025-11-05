from fastapi import APIRouter, Request, Response
import json
import sys
from urllib.parse import urlparse

# Rich metrics with graceful fallback
try:  # pragma: no cover - instrumentation path
    from prometheus_client import Counter  # type: ignore

    CSP_REPORTS = Counter(
        "csp_reports_total",
        "Total CSP violation reports",
        ["blocked_cat", "directive", "disposition"],
    )
    CSP_INLINE_TOTAL = Counter(
        "csp_inline_total",
        "Inline CSP violations (style/script)",
        ["kind"],
    )
except Exception:  # pragma: no cover - if prometheus_client unavailable
    CSP_REPORTS = None
    CSP_INLINE_TOTAL = None
    _CSP_COUNT = 0  # fallback total
    _CSP_INLINE = {"style": 0, "script": 0, "attr": 0}

router = APIRouter()


def _blocked_category(blocked_uri: str) -> str:
    if not blocked_uri:
        return "unknown"
    u = blocked_uri.strip().lower()
    if u in ("inline", "'inline'"):
        return "inline"
    if u.startswith("data:"):
        return "data"
    if u.startswith("blob:"):
        return "blob"
    if u.startswith("http://") or u.startswith("https://"):
        try:
            host = urlparse(u).hostname or "host"
        except Exception:
            host = "host"
        parts = host.split(".")
        cat = ".".join(parts[-2:]) if len(parts) >= 2 else host
        return f"host:{cat}"
    return "other"


@router.post("/csp-report")
async def csp_report(req: Request) -> Response:
    try:
        payload = await req.json()
        rep = payload.get("csp-report") or payload.get("csp_report") or {}
        blocked = rep.get("blocked-uri") or ""
        directive = (
            rep.get("effective-directive") or rep.get("violated-directive") or "unknown"
        )
        disposition = rep.get("disposition") or "enforce"
        cat = _blocked_category(blocked)

        # Inline subtype metrics
        if cat == "inline":
            if "style" in directive:
                kind = "style"
            elif "script" in directive:
                kind = "script"
            else:
                kind = "attr"
            if CSP_INLINE_TOTAL:
                CSP_INLINE_TOTAL.labels(kind=kind).inc()  # type: ignore[attr-defined]
            else:
                _CSP_INLINE[kind] = _CSP_INLINE.get(kind, 0) + 1  # type: ignore[index]

        if CSP_REPORTS:
            CSP_REPORTS.labels(blocked_cat=cat, directive=directive, disposition=disposition).inc()  # type: ignore[attr-defined]
        else:
            global _CSP_COUNT  # type: ignore
            _CSP_COUNT += 1  # type: ignore

        short = {
            k: rep.get(k)
            for k in (
                "effective-directive",
                "violated-directive",
                "blocked-uri",
                "source-file",
            )
        }
        print(
            f"[csp] report cat={cat} dir={directive} disp={disposition} data={json.dumps(short)[:1000]}",
            file=sys.stderr,
        )
    except Exception as e:  # pragma: no cover - defensive
        print(f"[csp] parse error: {e}", file=sys.stderr)
    return Response(status_code=204)
