from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel, HttpUrl, field_validator
from typing import List, Optional
import httpx
import os
import asyncio

router = APIRouter()
DEVDIAG_BASE = os.getenv("DEVDIAG_BASE", "")
DEVDIAG_JWT = os.getenv("DEVDIAG_JWT", "")
TIMEOUT_S = int(os.getenv("DEVDIAG_TIMEOUT_S", "120"))
DEVDIAG_ALLOW_HOSTS = {
    h.strip().lower()
    for h in os.getenv("DEVDIAG_ALLOW_HOSTS", "app.ledger-mind.org").split(",")
    if h.strip()
}


class RunPayload(BaseModel):
    url: HttpUrl
    preset: str = "app"  # chat | embed | app | full
    suppress: Optional[List[str]] = None
    tenant: str = "ledgermind"

    @field_validator("preset")
    @classmethod
    def check_preset(cls, v: str) -> str:
        if v not in {"chat", "embed", "app", "full"}:
            raise ValueError("invalid preset")
        return v

    @field_validator("url")
    @classmethod
    def check_host(cls, v: HttpUrl) -> HttpUrl:
        if v.host.lower() not in DEVDIAG_ALLOW_HOSTS:
            raise ValueError("target host not in allowlist")
        return v


def require_base():
    if not DEVDIAG_BASE:
        raise HTTPException(status_code=503, detail="DevDiag base URL not configured")
    return True


def _svc_headers(req: Request) -> dict:
    h = {"content-type": "application/json"}
    if DEVDIAG_JWT:
        h["authorization"] = f"Bearer {DEVDIAG_JWT}"
    for k in ("x-request-id", "x-b3-traceid", "x-b3-spanid", "x-cf-ray"):
        v = req.headers.get(k)
        if v:
            h[k] = v
    return h


async def _post_with_retry(url: str, json: dict, headers: dict, timeout: int):
    delays = (0.5, 1.5, 3.0)
    last = None
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=False) as client:
        for d in (0.0, *delays):
            if d:
                await asyncio.sleep(d)
            try:
                return await client.post(url, json=json, headers=headers)
            except httpx.TimeoutException as e:
                last = e
    raise last or RuntimeError("retry exhausted")


@router.get("/ops/diag/health")
async def diag_health(_: bool = Depends(require_base)):
    try:
        async with httpx.AsyncClient(timeout=10, follow_redirects=False) as client:
            r = await client.get(f"{DEVDIAG_BASE}/healthz")
        r.raise_for_status()
        return r.json()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"DevDiag health check failed: {e}")


@router.post("/ops/diag")
async def run_diag(
    payload: RunPayload, request: Request, _: bool = Depends(require_base)
):
    headers = _svc_headers(request)
    try:
        r = await _post_with_retry(
            f"{DEVDIAG_BASE}/diag/run", payload.model_dump(), headers, TIMEOUT_S
        )
        if r.status_code >= 400:
            raise HTTPException(status_code=r.status_code, detail=r.text)
        return r.json()
    except httpx.ReadTimeout:
        raise HTTPException(status_code=504, detail="DevDiag timed out")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"DevDiag call failed: {e}")
