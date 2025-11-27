# Legacy /api/* Compatibility Sunset

**What**: Temporary FastAPI routes under `/api/*` that bridge older frontend calls.

## Headers
All compat responses include:
- `Deprecation: true`
- `Link: <{new-endpoint}>; rel="alternate"`
- `Sunset: Wed, 31 Dec 2025 23:59:59 GMT`

## Metrics
Prometheus counter:

```
compat_endpoint_hits_total{path="<legacy-path>", source="client|probe"}
```

## Probing
The edge probe appends `?probe=1` so probe hits are labeled `source="probe"`.

## Dashboards
Organic usage (exclude probes):

```
sum by (path) (increase(compat_endpoint_hits_total{source="client"}[1d]))
```

Removal readiness:

```
max_over_time(sum by (path)(increase(compat_endpoint_hits_total{source="client"}[1d]))[7d:1d]) == 0
```

## Sunset Plan
1. Observe zero organic hits for ≥ 7 days.
2. Announce removal in release notes (Link header points to this doc).
3. Remove the specific compat handlers and their tests in one PR.
4. Keep the metric for one release to avoid scrape errors, then remove.

## Client Guidance
Use the normalized endpoints (non-`/api`) via the `getJson<T>()` or `fetchJSON` helpers. 404s should map to “no data” UI states.
