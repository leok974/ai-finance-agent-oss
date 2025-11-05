import uuid
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response
from app.utils.request_ctx import request_id as rid_ctx


class RequestIdMiddleware(BaseHTTPMiddleware):
    """Assigns or propagates a request id.

    Precedence:
      1. Incoming X-Request-ID header
      2. Generated UUID4
    Sets contextvar for downstream logging and injects header in response.
    """

    async def dispatch(self, request: Request, call_next):  # type: ignore[override]
        rid = request.headers.get("X-Request-ID") or str(uuid.uuid4())
        token = rid_ctx.set(rid)
        try:
            response: Response = await call_next(request)
        finally:
            try:
                rid_ctx.reset(token)
            except Exception:
                pass
        response.headers["X-Request-ID"] = rid
        return response
