#!/usr/bin/env python3
"""Lightweight local smoke: validate health, version stamp, metrics exposition, LLM path,
and optionally an authenticated round‑trip (/api/auth/login -> /api/auth/me).

Exit codes:
 0 success
 >0 failure (prints a concise summary + details to stderr)

Usage:
  python scripts/smoke-lite.py --base http://127.0.0.1

Assumptions:
 - nginx/front proxy listening at base
 - /version returns JSON with commit/version (not 'unknown')
 - /metrics returns text/plain (Prometheus style)
 - POST /agent/chat sets X-LLM-Path != 'unknown'
"""
from __future__ import annotations
import argparse
import sys
import json
import urllib.request
import urllib.error

DEFAULT_CHAT_BODY = {
    "messages": [{"role": "user", "content": "quick smoke greeting"}],
    "context": {},
    "intent": "general",
    "force_llm": True,
    "model": "gpt-oss:20b",
    "temperature": 0.2,
    "top_p": 0.9,
}


class SmokeFailure(Exception):
    pass


def fetch(
    url: str,
    method: str = "GET",
    data: dict | None = None,
    headers: dict[str, str] | None = None,
):
    hdrs = {"User-Agent": "smoke-lite/1"}
    if headers:
        hdrs.update(headers)
    payload = None
    if data is not None:
        blob = json.dumps(data).encode()
        payload = blob
        hdrs.setdefault("Content-Type", "application/json")
    req = urllib.request.Request(url, method=method, headers=hdrs, data=payload)
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            body = r.read()
            return r, body
    except urllib.error.HTTPError as e:
        raise SmokeFailure(
            f"HTTP {e.code} for {url}: {e.read().decode(errors='ignore')[:300]}"
        ) from e
    except Exception as e:  # pragma: no cover - network issues
        raise SmokeFailure(f"Request failed {url}: {e}") from e


def assert_health(base: str):
    r, body = fetch(f"{base}/healthz")
    if r.status != 200:
        raise SmokeFailure(f"/healthz status {r.status}")
    # minimal structural check
    if b"ok" not in body:
        raise SmokeFailure("/healthz missing 'ok' marker")
    return "healthz ok"


def assert_version(base: str):
    r, body = fetch(f"{base}/version")
    if r.status != 200:
        raise SmokeFailure(f"/version status {r.status}")
    try:
        js = json.loads(body)
    except Exception as e:
        raise SmokeFailure(f"/version invalid JSON: {e}")
    commit = js.get("commit") or js.get("version")
    if not commit or commit == "unknown":
        raise SmokeFailure(f"/version commit/version unknown ({commit})")
    return f"version commit={commit}"


def assert_metrics(base: str):
    r, body = fetch(f"{base}/metrics")
    ctype = r.headers.get("Content-Type", "")
    if "text/plain" not in ctype:
        snippet = body[:200].decode(errors="ignore")
        raise SmokeFailure(
            f"/metrics wrong content-type {ctype}; body head={snippet!r}"
        )
    if b"python_info" not in body and b"csp_reports_total_fallback" not in body:
        raise SmokeFailure("/metrics missing expected metric markers")
    return "metrics ok"


def assert_llm_chat(base: str):
    r, body = fetch(f"{base}/agent/chat", method="POST", data=DEFAULT_CHAT_BODY)
    xllm = r.headers.get("X-LLM-Path", "unknown")
    if xllm == "unknown":
        raise SmokeFailure("/agent/chat X-LLM-Path still unknown")
    # Ensure JSON shape
    try:
        js = json.loads(body)
    except Exception:
        raise SmokeFailure("/agent/chat non-JSON body")
    if not isinstance(js, dict):
        raise SmokeFailure("/agent/chat unexpected body type")
    return f"chat x-llm-path={xllm}"


def parse_set_cookies(resp) -> list[str]:  # pragma: no cover - trivial parsing
    raw = resp.headers.get_all("Set-Cookie") if hasattr(resp.headers, "get_all") else []
    if not raw:
        # Some implementations use repeated headers accessible via getheaders()
        try:
            raw = [v for (k, v) in resp.headers.items() if k.lower() == "set-cookie"]
        except Exception:
            raw = []
    cookies: list[str] = []
    for line in raw:
        part = line.split(";", 1)[0].strip()
        if "=" in part:
            cookies.append(part)
    return cookies


def cookie_header(cookies: list[str]) -> str:
    return "; ".join(cookies)


def assert_auth(base: str, email: str, password: str):
    login_body = {"email": email, "password": password}
    r, body = fetch(f"{base}/api/auth/login", method="POST", data=login_body)
    if r.status != 200:
        raise SmokeFailure(f"/api/auth/login status {r.status}")
    cookies = parse_set_cookies(r)
    if not cookies:
        raise SmokeFailure("login returned no cookies")
    # /api/auth/me
    hdr = {"Cookie": cookie_header(cookies)}
    r2, body2 = fetch(f"{base}/api/auth/me", headers=hdr)
    if r2.status != 200:
        raise SmokeFailure(f"/api/auth/me status {r2.status}")
    try:
        js = json.loads(body2)
    except Exception:
        raise SmokeFailure("/api/auth/me invalid JSON")
    if js.get("email") and email.lower() != str(js.get("email")).lower():
        # Not fatal mismatch but signal
        return f"auth ok (email mismatch resp={js.get('email')})"
    return "auth ok"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--base", default="http://127.0.0.1", help="Base URL (no trailing slash)"
    )
    ap.add_argument(
        "--auth",
        action="store_true",
        help="Enable auth roundtrip (/api/auth/login + /api/auth/me)",
    )
    ap.add_argument(
        "--auth-email", default=None, help="Email for auth smoke (required if --auth)"
    )
    ap.add_argument(
        "--auth-password",
        default=None,
        help="Password for auth smoke (or set SMOKE_AUTH_PASSWORD env)",
    )
    args = ap.parse_args()
    base = args.base.rstrip("/")

    results: list[str] = []
    import os

    try:
        results.append(assert_health(base))
        results.append(assert_version(base))
        results.append(assert_metrics(base))
        results.append(assert_llm_chat(base))
        if args.auth:
            email = args.auth_email or os.getenv("SMOKE_AUTH_EMAIL")
            password = args.auth_password or os.getenv("SMOKE_AUTH_PASSWORD")
            if not email or not password:
                raise SmokeFailure(
                    "--auth specified but email/password not provided (use --auth-email/--auth-password or env vars)"
                )
            results.append(assert_auth(base, email, password))
    except SmokeFailure as e:
        print("SMOKE FAILED:", e, file=sys.stderr)
        for line in results:
            print("PASSED:", line, file=sys.stderr)
        sys.exit(1)
    print("SMOKE OK:" + " | ".join(results))


if __name__ == "__main__":
    main()
