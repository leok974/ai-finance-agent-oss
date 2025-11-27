# Playwright Path Rules Smoke Test

This suite enforces SPA path migration rules:
- No legacy `/api/agent/*` or `/api/ingest/*` fetches.
- Suggestions route/panel gated (no network calls when disabled).
- Metrics alias `/api/metrics` works (redirect / instrumentation) and `/metrics` returns Prometheus exposition.

## Running Locally

```powershell
# One-time browser install
pnpm -C apps/web exec playwright install --with-deps

# Run tests (auto-starts Vite dev server if PW_BASE_URL not set)
pnpm -C apps/web test:pw
```

## Against a Remote Environment

```powershell
$env:PW_BASE_URL = 'https://app.ledger-mind.org'
pnpm -C apps/web test:pw
```
When `PW_BASE_URL` is set the dev server will NOT be launched; tests hit the provided base directly.

## What It Checks
1. Visiting `/` and `/rules/suggestions` triggers no forbidden `/api/agent`, `/api/ingest`, or `/api/rules/suggestions` calls.
2. `/api/metrics` returns a 2xx/3xx status.
3. `/metrics` returns text containing `# HELP` (basic Prometheus exposition sanity).

## Troubleshooting
| Issue | Cause | Fix |
|-------|-------|-----|
| `ERR_EMPTY_RESPONSE` | Dev server not started and no PW_BASE_URL provided | Ensure test launches (webServer) or run `pnpm dev` manually |
| `404 /api/metrics` | Backend not instrumented or proxy missing | Confirm vite proxy includes `/api/metrics` & server running backend |
| `Forbidden path detected` | A regression introduced `/api/agent` or `/api/ingest` call | Replace with root path (`/agent/...` or `/ingest/...`) |

## Extending
Add new assertions to `tests/e2e/smoke-paths.spec.ts` for additional critical API surfaces (e.g., POST charts summary) to tighten regression safety.
