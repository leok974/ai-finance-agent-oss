# Edge CSP Metrics Integration

This document describes how the external probe pushes CSP header metrics into the backend, how those metrics are exposed, and how to operationalize them with Prometheus and Grafana.

## 1. Metric Flow

1. Probe (`scripts/edge-verify.ps1`) fetches the site, extracts:
   - CSP header presence, value, length
   - SHA256 hash of the CSP header value
2. If `EDGE_PUSH_URL` is set, the probe POSTs JSON to the backend endpoint:
   `POST /api/metrics/edge` with body:
   ```json
   { "csp_policy_len": <int>, "csp_policy_sha256": "<hex>" }
   ```
3. Backend route (`app/routes/edge_metrics.py`) updates Prometheus gauges or in-process fallbacks:
   - `edge_csp_policy_length` (Gauge)
   - `edge_metrics_timestamp_seconds` (Gauge)
   - `edge_csp_policy_sha{sha="<hex>"} 1` (Gauge with label)
4. Backend enforces a single active hash series: previous hash is set to 0 before the new hash is set to 1, ensuring exactly one `edge_csp_policy_sha{sha=...}` has value 1.

## 2. Environment Variables

| Variable | Context | Purpose |
|----------|---------|---------|
| `EDGE_PUSH_URL` | Probe | Full URL to backend ingestion endpoint (e.g. `https://backend.example.com/api/metrics/edge`) |
| `EDGE_METRICS_TOKEN` | Backend & Probe | Shared secret; if set on backend, probe must send `X-Edge-Token` header with same value |

## 3. Security Notes
- If `EDGE_METRICS_TOKEN` is unset backend accepts unauthenticated pushes (use only in trusted/internal network).
- Recommended deployment: set a strong random token (32+ bytes base64) and provide it to the probe runtime via secret store.
- The payload is intentionally small; rate limit via WAF / reverse proxy if needed.

## 4. Prometheus Recording Rules
Create or extend a rules file, e.g. `prometheus/rules/csp.yml`:

```yaml
groups:
- name: csp_edge
  rules:
  # Current CSP SHA series (value always 1 for the active hash)
  - record: edge_csp_policy_sha_current
    expr: max by (sha) (edge_csp_policy_sha == 1)

  # Convenience: current length
  - record: edge_csp_policy_length_current
    expr: max(edge_csp_policy_length)

  # Convenience: last push timestamp (scalar)
  - record: edge_metrics_last_push_seconds
    expr: max(edge_metrics_timestamp_seconds)
```

Reload Prometheus (hot-reload endpoint or container restart depending on setup).

## 5. Grafana Panels

### Current CSP Hash (Table)
- Query: `edge_csp_policy_sha_current`
- Transform: Labels to fields → show `sha` and `Value`.

### Current Policy Length (Stat)
- Query: `edge_csp_policy_length_current`
- Unit: `none` (or `short`).

### Last Push Age (Stat)
- Query: `time() - edge_metrics_last_push_seconds`
- Thresholds: green < 600, yellow < 1800, red ≥ 1800 (example).

## 6. Alert Examples

Policy push stalled (>30m):
```promql
time() - edge_metrics_last_push_seconds > 1800
```

Policy hash changed in last hour:
```promql
changes(edge_csp_policy_sha_current[1h]) > 0
```

(Optional) Unexpected multiple active hashes (should be 0):
```promql
count(edge_csp_policy_sha == 1) != 1
```

## 7. Operational Tips
- Combine with existing drift hash baseline checks to distinguish intentional vs. unexpected changes.
- If swap to a new CSP policy is planned, watch for both a hash change and matching PR updating baseline hash file to avoid alert fatigue.
- Consider adding a synthetic panel that concatenates `sha` + `length` as a single status summary using Grafana transformations.

## 8. Fallback Mode
If Prometheus client library is absent, `/api/metrics` (fallback) will include lines:
```
edge_csp_policy_length <n>
edge_csp_policy_sha{sha="<hex>"} 1
edge_metrics_timestamp_seconds <unix_ts>
```
Only last pushed hash is emitted.

## 9. Testing
1. Run probe locally with env vars:
```powershell
$env:EDGE_PUSH_URL = 'https://localhost/api/metrics/edge'
$env:EDGE_METRICS_TOKEN = 'dev-token'
./scripts/edge-verify.ps1 -HostUrl https://localhost -Json | Out-Null
```
2. Curl backend metrics endpoint and verify gauges.
3. Modify CSP header (temporarily) and repeat to observe old SHA -> 0, new SHA -> 1.

---
This closes the observability loop between edge enforcement and internal monitoring.
