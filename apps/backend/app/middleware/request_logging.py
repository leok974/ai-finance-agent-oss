import json
import time
import uuid
import logging
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response
from app.utils.request_ctx import request_id as rid_ctx

log = logging.getLogger("req")


class RequestLogMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        t0 = time.perf_counter()
        rid = request.headers.get("X-Request-ID") or str(uuid.uuid4())
        path = request.url.path
        method = request.method
        client = request.client.host if request.client else "unknown"

        token = rid_ctx.set(rid)
        try:
            response: Response = await call_next(request)
        finally:
            try:
                rid_ctx.reset(token)
            except Exception:
                pass
        dt_ms = int((time.perf_counter() - t0) * 1000)
        response.headers["X-Request-ID"] = rid

        xff = request.headers.get("x-forwarded-for")
        xrp = request.headers.get("x-real-ip")
        payload = {
            "rid": rid,
            "method": method,
            "path": path,
            "status": response.status_code,
            "duration_ms": dt_ms,
            "client_ip": client,
        }
        if xff:
            payload["xff"] = xff
        if xrp:
            payload["x_real_ip"] = xrp
        log.info(json.dumps(payload, ensure_ascii=False))
        return response
