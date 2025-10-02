from __future__ import annotations
import os
from io import BytesIO
import pytest

# Candidate endpoints observed historically (broadened to include bare /ingest)
CANDIDATE_PATHS = (
    "/ingest",        # some backends mount here
    "/ingest/csv",
    "/agent/ingest/csv",
    "/api/ingest/csv",
)

# Common multipart field names
CANDIDATE_FIELDS = ("file", "csv", "upload", "data")

# Status codes we tolerate for smoke runs (never accept 5xx).
OK_SET = {200, 201, 202, 204}
UNAUTH_SET = {401, 403}
VALIDATION_SET = {400, 413, 415, 422}
NOT_IMPLEMENTED_SET = {404, 405}


def _csv_bytes(rows: int = 1) -> bytes:
    """Generate a tiny or larger CSV. Default is a single row for speed.
    Control via INGEST_CSV_ROWS (e.g., 500) or INGEST_LARGE=1 (uses 500 rows)."""
    want_large = os.getenv("INGEST_LARGE") in {"1", "true", "TRUE"}
    env_rows = os.getenv("INGEST_CSV_ROWS")
    if env_rows and env_rows.isdigit():
        rows = max(1, int(env_rows))
    elif want_large:
        rows = max(rows, 500)
    lines = ["date,amount,merchant"]
    for i in range(rows):
        lines.append(f"2025-01-{(i%28)+1:02d},{(i%100)+0.01:.2f},Coffee Bar {i%7}")
    return ("\n".join(lines) + "\n").encode("utf-8")


def _multipart_attempt(client, path: str, headers: dict | None, rows: int = 1):
    """
    Try uploading as multipart/form-data using several likely field names.
    Returns (resp, path, field) on first non-404/405 outcome, else (last_resp, path, None).
    """
    csv_bytes = _csv_bytes(rows=rows)
    for field in CANDIDATE_FIELDS:
        files = {field: ("tiny.csv", BytesIO(csv_bytes), "text/csv")}
        r = client.post(path, files=files, headers=headers or {})
        if r.status_code not in NOT_IMPLEMENTED_SET:
            return r, path, field
    return r, path, None  # last response


def _binary_attempt(client, path: str, headers: dict | None, rows: int = 1):
    """
    Try raw body POST with text/csv content type (some backends expect this).
    """
    h = {"Content-Type": "text/csv"}
    if headers:
        h.update(headers)
    r = client.post(path, content=_csv_bytes(rows=rows), headers=h)
    return r, path


def _first_existing_path(client) -> str | None:
    """
    Return the first candidate path that doesn't 404 for at least one method probe.
    """
    for p in CANDIDATE_PATHS:
        # Try GET/OPTIONS to detect presence without requiring POST acceptance
        if client.options(p).status_code not in {404}:
            return p
        if client.get(p).status_code not in {404}:
            return p
    return None


@pytest.mark.parametrize("header_name,header_value", [
    ("Origin", "http://localhost"),
    ("Access-Control-Request-Method", "POST"),
])
def test_ingest_options_preflight_tolerant(client, header_name, header_value):
    """
    OPTIONS should not 5xx. Many backends 404/405 OPTIONS; we tolerate that.
    """
    path = _first_existing_path(client) or CANDIDATE_PATHS[0]
    r = client.options(path, headers={header_name: header_value})
    assert r.status_code < 500, f"unexpected 5xx on OPTIONS {path}: {r.status_code}"


def test_ingest_post_unauth_tolerant(client):
    """
    Unauthenticated POST should never 5xx.
    Accept 401/403 (auth-guarded) or 2xx/4xx (public/demo mode).
    Tries multipart first, falls back to raw CSV.
    """
    last_resp = None
    last_path = None

    for path in CANDIDATE_PATHS:
        r, used_path, _ = _multipart_attempt(client, path, headers=None, rows=1)
        last_resp, last_path = r, used_path
        if r.status_code not in NOT_IMPLEMENTED_SET:
            break
        r, used_path = _binary_attempt(client, path, headers=None, rows=1)
        last_resp, last_path = r, used_path
        if r.status_code not in NOT_IMPLEMENTED_SET:
            break

    assert last_resp is not None, "no response captured"
    assert last_resp.status_code < 500, f"unexpected 5xx on {last_path}: {last_resp.status_code}"
    assert last_resp.status_code in (OK_SET | UNAUTH_SET | VALIDATION_SET | NOT_IMPLEMENTED_SET), \
        f"unexpected status {last_resp.status_code} for unauth ingest at {last_path}"


def test_ingest_post_auth_tolerant(auth_client):
    """
    Authenticated POST should never 5xx. We still accept 401/403 in case the
    API uses cookie+CSRF rather than Bearer for uploads (env-dependent).
    """
    headers = {}
    last_resp = None
    last_path = None

    for path in CANDIDATE_PATHS:
        r, used_path, _ = _multipart_attempt(auth_client, path, headers=headers, rows=1)
        last_resp, last_path = r, used_path
        if r.status_code not in NOT_IMPLEMENTED_SET:
            break
        r, used_path = _binary_attempt(auth_client, path, headers=headers, rows=1)
        last_resp, last_path = r, used_path
        if r.status_code not in NOT_IMPLEMENTED_SET:
            break

    assert last_resp is not None, "no response captured"
    assert last_resp.status_code < 500, f"unexpected 5xx on {last_path}: {last_resp.status_code}"
    assert last_resp.status_code in (OK_SET | UNAUTH_SET | VALIDATION_SET | NOT_IMPLEMENTED_SET), \
        f"unexpected status {last_resp.status_code} for auth ingest at {last_path}"


@pytest.mark.skipif(os.getenv("AUTH_E2E") not in {"1","true","TRUE"}, reason="happy-path auth ingest disabled")
def test_ingest_post_auth_happy_path(auth_client):
    """
    When AUTH_E2E=1 (and your stack issues an accepted auth for uploads),
    require a 2xx on at least one variant. Fails if only 401/403/4xx outcomes.
    """
    headers = {}
    got_2xx = False
    outcomes = []

    for path in CANDIDATE_PATHS:
        r, used_path, field = _multipart_attempt(auth_client, path, headers=headers, rows=1)
        outcomes.append((used_path, "multipart", field, r.status_code))
        if r.status_code in OK_SET:
            got_2xx = True
            break
        r, used_path = _binary_attempt(auth_client, path, headers=headers, rows=1)
        if r.status_code in OK_SET:
            got_2xx = True
            break

    assert got_2xx, f"expected a 2xx happy path; outcomes={outcomes}"

@pytest.mark.skipif(os.getenv("INGEST_LARGE") not in {"1","true","TRUE"}
                    and not (os.getenv("INGEST_CSV_ROWS") and os.getenv("INGEST_CSV_ROWS").isdigit()),
                    reason="large ingest disabled")
def test_ingest_post_auth_large_optional(auth_client):
    """Optional large-ish upload (rows controlled via INGEST_CSV_ROWS or INGEST_LARGE=1 -> 500).
    Still tolerant: forbid 5xx, allow 2xx/4xx depending on env."""
    headers = {}
    last = None; last_path = None; rows = None
    rows = int(os.getenv("INGEST_CSV_ROWS") or "500") if os.getenv("INGEST_LARGE") in {"1","true","TRUE"} or os.getenv("INGEST_CSV_ROWS") else 500
    for path in CANDIDATE_PATHS:
        r, used_path, _ = _multipart_attempt(auth_client, path, headers=headers, rows=rows)
        last, last_path = r, used_path
        if r.status_code not in NOT_IMPLEMENTED_SET:
            break
        r, used_path = _binary_attempt(auth_client, path, headers=headers, rows=rows)
        last, last_path = r, used_path
        if r.status_code not in NOT_IMPLEMENTED_SET:
            break
    assert last is not None
    assert last.status_code < 500, f"unexpected 5xx on {last_path} (rows={rows}): {last.status_code}"
    assert last.status_code in (OK_SET | UNAUTH_SET | VALIDATION_SET | NOT_IMPLEMENTED_SET)
