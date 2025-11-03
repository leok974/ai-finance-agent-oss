# Observability Contract

This document captures stable expectations for metrics, headers, and test patterns. It aims to prevent brittle assertions while preserving meaningful regression coverage.

## Prometheus Exposition
- Format is **plain text**, not JSON. Do not assert absence of characters like `{` or `}` (they are required for labels).
- Match metrics by **metric name + labels**, not by line order or full raw line string.
- Allow timestamps that are integers, floats, or scientific notation (e.g. `1.7501232e+09`).
- Avoid asserting on HELP/TYPE ordering beyond ensuring the output starts with `# HELP` (alias tests already do this).

## Edge Metrics Ingestion
- Endpoint: `POST /api/metrics/edge` (alias exposed alongside `/metrics`).
- Environment variable `EDGE_METRICS_TOKEN` is read **per request**; tests should monkeypatch or set env before making the request (no import‑time capture).
- Gauges:
  - `edge_csp_policy_length` — numeric length of observed CSP header.
  - `edge_csp_policy_sha{sha="<HASH>"}` — value `1` for the current active hash; previous hash series explicitly zeroed on change.
  - `edge_metrics_timestamp_seconds` — unix epoch of last successful push.
- Gauge collectors are **reused across module reloads**; duplicate registration must not degrade into fallback mode.

## LLM Path Header
- `X-LLM-Path` header must be present on all `/agent/chat` responses (forced early so short‑circuit responses retain it).
- Tests should assert `in resp.headers` rather than strict value unless semantics rely on a specific path.

## Time Determinism
- Tests pin time using Freezegun. Avoid code that reads wall time in ways Freezegun cannot intercept (e.g. `datetime.now(tz=...)` is OK; raw OS syscalls outside Python stdlib wrappers may not be).
- Favor relative windows instead of absolute timestamp equality when asserting time logic.

## Test Patterns (Do / Avoid)
| Do | Avoid |
|----|-------|
| `content_type.startswith("text/plain")` | Exact equality with full charset variant |
| Regex allowing scientific notation for timestamps | Hard-coded integer-only timestamp regex |
| Assert presence/uniqueness of metric names | Counting entire output length or ordering |
| Monkeypatch env per test | Relying on import-time env capture |
| Use `increase(metric[window])` in PromQL dashboards | Direct alerting on raw monotonically increasing counter without rate/increase |

## Token Handling
- Empty `EDGE_METRICS_TOKEN` means unauthenticated (permit all) ingestion (used in tests).
- Non-empty token: requests must supply matching `X-Edge-Token` header (case-insensitive).

## Resilience Guidelines
- If instrumentation library unavailable, fallback mode emits minimal lines; tests should remain green (skip instrumentation-only specifics).
- Future metric additions should NOT break existing tests; keep assertions narrow to current invariants.

---
Last updated: 2025-10-01
