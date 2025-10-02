from fastapi.testclient import TestClient
from fastapi import Request
from app.main import app

def test_middleware_injects_llm_path_on_early_return():
    async def early_exit(_req: Request):
        # No header set; return plain dict to rely on middleware injection.
        return {"ok": True, "note": "early"}

    path = "/_test/early-exit"
    # Avoid duplicate route registration across test re-imports.
    if not any(getattr(r, "path", None) == path for r in app.router.routes):
        app.add_api_route(path, early_exit, methods=["GET"])

    client = TestClient(app)
    res = client.get(path)
    assert res.status_code == 200
    assert "X-LLM-Path" in res.headers, res.headers
    assert res.headers["X-LLM-Path"] in {"unknown", "stub/blocked", "fallback", "primary", "router", "fallback-stub"}
