from fastapi import APIRouter, Request, Response, Header
import os
import time


# NOTE: Do not capture EDGE_METRICS_TOKEN at import time for tests: the
# autouse fixture sets it after module import. Read lazily per request so
# tests injecting the token (and potential future hot-reloads) observe it.
def _edge_token() -> str:  # pragma: no cover - trivial accessor
    return os.getenv("EDGE_METRICS_TOKEN", "").strip()


def _get_or_create_gauge(
    name: str, doc: str, labelnames: list[str] | None = None
):  # pragma: no cover - helper
    """Return an existing Gauge if already registered (module reload) else create one.

    Prometheus client raises ValueError on duplicate registration. We treat that
    as a signal to look up the pre-existing collector from the default registry
    and continue operating in *instrumented* mode (PROM_OK stays True) instead
    of falling back to the simple counters. This keeps tests that reload the
    module able to observe gauge state transitions.
    """
    try:
        from prometheus_client import REGISTRY, Gauge  # type: ignore

        if labelnames:
            return Gauge(name, doc, labelnames)
        return Gauge(name, doc)
    except ValueError:
        # Duplicate registration: fetch existing collector
        try:
            from prometheus_client import REGISTRY  # type: ignore

            existing = REGISTRY._names_to_collectors.get(name)  # type: ignore[attr-defined]
            return existing
        except Exception:
            raise


try:  # pragma: no cover - instrumentation path
    EDGE_LEN = _get_or_create_gauge(
        "edge_csp_policy_length", "Length of CSP header observed by external probe"
    )
    EDGE_TS = _get_or_create_gauge(
        "edge_metrics_timestamp_seconds", "Unix timestamp of last edge metrics push"
    )
    EDGE_SHA = _get_or_create_gauge("edge_csp_policy_sha", "Current CSP header hash at edge (label=sha, value=1)", ["sha"])  # type: ignore
    PROM_OK = all([EDGE_LEN, EDGE_TS, EDGE_SHA])
except Exception:  # pragma: no cover
    PROM_OK = False
    _EDGE_LEN = 0
    _EDGE_TS = 0
    _EDGE_SHA = ""

router = APIRouter()

_LAST_SHA = None  # track last seen SHA to zero old series


@router.post("/metrics/edge")
async def push_edge_metrics(
    req: Request,
    x_edge_token: str | None = Header(
        default=None, convert_underscores=False, alias="X-Edge-Token"
    ),
):
    # Accept header even if FastAPI didn't map underscores -> hyphen; alias ensures correct capture.
    supplied = (x_edge_token or "").strip()
    token = _edge_token()
    if token and supplied != token:
        return Response(status_code=401)
    try:
        data = await req.json()
    except Exception:
        return Response(status_code=400)
    length = int(data.get("csp_policy_len", 0))
    sha = str(data.get("csp_policy_sha256", "")).strip()
    now = int(time.time())

    if PROM_OK:
        # ensure only one active SHA series is 1
        global _LAST_SHA  # type: ignore
        try:
            prev = _LAST_SHA
        except Exception:  # pragma: no cover
            prev = None
        if prev and prev != sha:
            try:
                EDGE_SHA.labels(sha=prev).set(0)
            except Exception:
                pass
        if sha:
            EDGE_SHA.labels(sha=sha).set(1)
        EDGE_LEN.set(length)
        EDGE_TS.set(now)
        _LAST_SHA = sha
    else:  # fallback
        global _EDGE_LEN, _EDGE_TS, _EDGE_SHA  # type: ignore
        _EDGE_LEN = length  # type: ignore
        _EDGE_TS = now  # type: ignore
        _EDGE_SHA = sha  # type: ignore

    return Response(status_code=204)


def get_edge_fallback_metrics() -> list[str]:  # pragma: no cover - simple accessor
    if PROM_OK:
        return []
    lines: list[str] = []
    lines.append(f"edge_csp_policy_length {_EDGE_LEN}")
    if _EDGE_SHA:
        lines.append(f'edge_csp_policy_sha{{sha="{_EDGE_SHA}"}} 1')
    lines.append(f"edge_metrics_timestamp_seconds {_EDGE_TS}")
    return lines
