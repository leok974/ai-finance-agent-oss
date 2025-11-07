# AI Finance Agent (gpt-oss:20b)

![Coverage](docs/badges/coverage.svg)
![Ingest smoke](https://img.shields.io/github/actions/workflow/status/leok974/ai-finance-agent-oss/ingest-smoke.yml?label=ingest%20smoke)

> Production-ready personal finance + LLM agent stack (FastAPI + React + Ollama/OpenAI) with KMS-backed encryption, Cloudflare tunnel ingress, and hardened nginx edge.

## ML Pipeline (Phase 2.1) — Status 🚀
**Production-ready** merchant-majority suggestions with confidence gating, durable logs, and drift guards.

**What's live**
- Merchant Top-K majority (≥3 support, p≥0.70) → rule suggestion `merchant-majority@v1`
- Confidence gate: `<0.50` → **Ask the agent** (logged for learning)
- Durable logs: `suggestions.reason_json`, `model_version`, `source`
- CI drift guard: `.github/workflows/db-drift.yml`
- Self-tests: `help-selftest`, ML nightly (LightGBM + isotonic calibration)

**Quick smoke**
```bash
make ml-drift-check          # alembic upgrade + drift check
make ml-smoke-test           # end-to-end suggest_auto smoke
make ml-verify-logs          # view recent suggestions (formatted table)
```

**Key endpoints**
- `POST /ml/suggestions` → best candidate or `{ mode: "ask" }`
- `POST /ml/suggestions/{id}/accept` → accept suggestion (idempotent)
- `GET  /ml/status` → shadow/canary/calibration status
- `GET  /agent/describe/_selftest?month=YYYY-MM` → RAG/Help self-test

**Canary rollout**
```bash
make canary-status           # check current SUGGEST_USE_MODEL_CANARY %
make canary-10              # ramp to 10%
make canary-50              # ramp to 50%
make canary-100             # full rollout
make canary-0               # emergency rollback
```

**Next (tracked)**
1) ✅ UI acceptance → set `suggestions.accepted=true` (COMPLETE)
2) Grafana: accept-rate & top labels by model_version (see `docs/GRAFANA_ML_PANELS.md`)
3) Canary ramp: `SUGGEST_USE_MODEL_CANARY=0→10%→50%→100%` (see `docs/ML_CANARY_RAMP_PLAYBOOK.md`)

**Docs**
- [`apps/backend/ML_DEPLOYMENT_COMPLETE.md`](apps/backend/ML_DEPLOYMENT_COMPLETE.md) - Integration summary
- [`apps/backend/ML_PIPELINE_SMOKE_TEST.md`](apps/backend/ML_PIPELINE_SMOKE_TEST.md) - Test checklist
- [`docs/GRAFANA_ML_PANELS.md`](docs/GRAFANA_ML_PANELS.md) - Prometheus queries (paste-ready)
- [`docs/ML_CANARY_RAMP_PLAYBOOK.md`](docs/ML_CANARY_RAMP_PLAYBOOK.md) - Full rollout strategy
- [`docs/CANARY_RAMP_QUICKOPS.md`](docs/CANARY_RAMP_QUICKOPS.md) - Daily ops checklist ⚡
- [`docs/ML_E2E_SMOKE_TEST.md`](docs/ML_E2E_SMOKE_TEST.md) - E2E validation guide
- [`docs/GITHUB_BRANCH_PROTECTION.md`](docs/GITHUB_BRANCH_PROTECTION.md) - CI/CD required checks

---

## Quick Start (Prod Compose Path)

```bash
git clone https://github.com/leok974/ai-finance-agent-oss.git
cd ai-finance-agent-oss

# 1. Provide env (minimal example)
cat > .env <<'EOF'
ENCRYPTION_ENABLED=1
GCP_KMS_KEY=projects/ledgermind-03445-3l/locations/global/keyRings/ledgermind/cryptoKeys/backend
GCP_KMS_AAD=app=ledgermind,env=prod
MODEL=gpt-oss:20b
# Optional fallback OpenAI
OPENAI_API_KEY=sk-...   # or placed as secret file
EOF

# 2. Place GCP service account JSON (not committed)
mkdir -p secrets/gcp-sa.json
cp /path/to/ledgermind-backend-sa.json secrets/gcp-sa.json/ledgermind-backend-sa.json

# 3. Start stack (Docker Desktop context example)
docker --context desktop-linux compose -f docker-compose.prod.yml -f docker-compose.prod.override.yml up -d

# 4. Verify
curl -s https://app.ledger-mind.org/ready | jq
```

Access the app via: https://app.ledger-mind.org

> Security Note: `.env` is git-ignored and may include sensitive values (KMS keys, tunnel tokens, API keys). Never commit real secrets. For Cloudflare tunnel token mode add `CLOUDFLARE_TUNNEL_TOKEN=...` to `.env` (or use `secrets/cloudflared_token.txt` with the helper script `scripts/tunnel-token-fingerprint.ps1`). Rotate immediately if you suspect exposure.

Additional verification & smoke steps: see [`docs/VERIFY_PROD.md`](docs/VERIFY_PROD.md).

For a production-like local stack workflow (hash-rendered CSP, nginx edge), see [`docs/PROD_LOCAL_RUNBOOK.md`](docs/PROD_LOCAL_RUNBOOK.md).

> Canonical local edge port is now **80** (legacy 8080 mapping removed). The helper script `scripts/edge-port.ps1` remains for resilience (auto-detects 80/8080 and can fail with `-FailOnMulti` if multiple nginx containers exist). CI enforces a single nginx + port 80; use `make edge-port-strict` locally to mirror that check.

#### Fast Prod-Local Shortcuts

If you have GNU Make installed:

```bash
make prod-local         # build (unless FAST=1) + up + health/header checks
make prod-local FAST=1  # skip nginx rebuild
make prod-local NGINX_ONLY=1  # only start nginx first
make prod-local-down    # tear down prod-local stack
```

Windows / environments without `make`:

```powershell
pwsh scripts/prod-local.ps1                # full flow (build + up + probes)
pwsh scripts/prod-local.ps1 -Fast          # skip build
pwsh scripts/prod-local.ps1 -Fast -NginxOnly  # only nginx service
pwsh scripts/prod-local-down.ps1           # tear down
```

These invoke the same steps as the runbook: CSP hash render (`pnpm run csp:hash`), optional nginx image build, compose up, then local health and header spot checks (CSP, Referrer, Permissions, /api/metrics 307 alias).

> Legacy /api/* compatibility: see `docs/deprecation-compat.md` for headers, metrics, and sunset plan.

### Extended Edge & LLM Verification

For a deeper end-to-end check (edge → backend → LLM runtime → tunnel metrics) use the script `scripts/edge-verify.ps1`.

Make target (runs with model generate + verbose models):
```powershell
make edge-verify
```

Direct usage examples:
```powershell
# Basic (human readable)
pwsh ./scripts/edge-verify.ps1

# Include a lightweight generate call and emit JSON (CI friendly)
pwsh ./scripts/edge-verify.ps1 -IncludeGenerate -Json | jq

# Different hostname + stricter latency thresholds
pwsh ./scripts/edge-verify.ps1 -HostName app.ledger-mind.org -WarnLatencyMs 600 -CriticalLatencyMs 1500
```

Checks performed:
- Core endpoints: `/ready`, `/api/healthz`, `/health/simple`, `/api/live`, `/agui/ping`, `/llm/health`
- Parses `/api/healthz` for: status, reasons, Alembic sync, crypto readiness, model status
- Model discovery via `/agent/models` (provider, default, merged ids)
- LLM echo latency (`/llm/echo`)
- Optional generate request (`/api/generate`) with `-IncludeGenerate`
- Cloudflared tunnel metrics (`:2000/metrics`) summarizing HA connection series
 - Optional auth register/login probe with Cloudflare challenge fallback (see below)

Exit codes:
| Code | Meaning |
|------|---------|
| 0 | All critical checks passed |
| 2 | One or more critical failures (endpoint non-200, generate fail, etc.) |

JSON schema (abridged):
```jsonc
{
  "host": "app.ledger-mind.org",
  "ts": "2025-09-29T12:34:56.789Z",
  "endpoints": {
    "ready": {"code":"200","latency_ms":42,"severity":"ok"},
    "healthz": {"code":"200","details":{"crypto_ready":true,"alembic_in_sync":true}}
  },
  "llm": {"provider":"ollama","default":"gpt-oss:20b","models":["gpt-oss:20b","default"],"echo_latency_ms":123},
  "tunnel": {"status":"ok","metrics_present":true},
  "summary": {"critical":[],"warnings":[],"ok":true}
}
```

Typical remediation hints:
- Crypto not ready → verify GCP SA mount & `GCP_KMS_KEY` correctness.
- Models missing → ensure Ollama container healthy & model pulled (`docker compose logs ollama`).
- Tunnel metrics absent → check `cloudflared` container health / credentials and that metrics port is exposed (`--metrics 0.0.0.0:2000`).
- High latency warnings → investigate network path (Cloudflare status, local ISP) or container CPU throttling.

### Provider-aware latency rollup

Generate a quick provider breakdown (primary vs fallback) from recent edge verification output:

```powershell
pnpm run report:latency
```

Flags:

- `--input` – glob of JSON results (defaults to `edge-verify.json`)
- `--format=prometheus` – emit Prometheus-style metrics for scraping
- `--rollup` – merge multiple files before percentile math

Integrate into CI for a post-deploy gate:
```yaml
- name: Extended edge verification
  run: pwsh ./scripts/edge-verify.ps1 -IncludeGenerate -Json | tee edge-verify.json
```

Future enhancements (not yet implemented): streaming token rate metrics, per-model warm cache probe, optional auth flow.

## CSP pipeline (runtime hashing)

We removed the build‑time CSP hash extraction step. Instead, the nginx container computes inline script hashes when it starts:

How it works:
1. `deploy/nginx.conf` includes `script-src 'self' __INLINE_SCRIPT_HASHES__`.
2. Entry script `/docker-entrypoint.d/10-csp-render.sh` scans `index.html` for inline `<script>` tags without `src`.
3. For each block, it generates a `sha256-...` hash and substitutes the placeholder. If no inline scripts exist, it simply removes the placeholder (leaving `script-src 'self'`).

Operational notes:
- No `pnpm run csp:hash` step is required anymore.
- Adding or removing inline scripts only requires an nginx container restart to refresh hashes.
- Prefer moving logic into external JS modules to avoid needing hashes at all.

Redeploy & verify:
```bash
pnpm -C apps/web build
docker compose -f docker-compose.prod.yml -f docker-compose.prod.override.yml build nginx
docker compose -f docker-compose.prod.yml -f docker-compose.prod.override.yml up -d nginx
curl -sI http://127.0.0.1/ | grep -i content-security-policy
```
If inline scripts exist you’ll see one or more `sha256-` entries under `script-src`. If not, only `'self'` appears.

**CI guard**

The workflow renders the CSP (`pnpm run csp:hash`) and fails if the placeholder survives in `nginx.conf.rendered`. A hash manifest is uploaded as an artifact for traceability.


### Cloudflare Challenge Mitigation for Auth Scripts

Automated auth flows (CI probes, edge verification) can be blocked by Cloudflare's managed or bot rules, returning an interstitial HTML challenge (commonly surfaced to curl as a 3xx -> HTML body). We implement a resilient fallback via `scripts/test-auth.ps1` that:

1. Attempts register/login against the public edge hostname with a browser-like User-Agent and follows redirects.
2. Detects an HTML challenge or non-JSON body.
3. Falls back to origin loopback (`http://127.0.0.1`) for the same endpoints.
4. Reports mode (`edge` or `origin_fallback`) + `challenged=true/false` in JSON.

Integrated into `edge-verify.ps1` when `-AuthTest` is supplied. Prometheus metrics exported (when `-EmitPromMetrics`):
```
edge_auth_ok            1|0
edge_auth_challenged    1|0   # 1 indicates the edge blocked direct auth and origin fallback was needed
```

#### Recommended Cloudflare WAF Skip Rule
Create a dedicated rule allowing your auth endpoints for non-browser automation to reduce fallback frequency (still retaining other protections):

Dashboard → Security → WAF → Custom Rules → Create:
```
When (any):
  (http.request.uri.path contains "/api/auth/login") OR
  (http.request.uri.path contains "/api/auth/register") OR
  (http.request.uri.path contains "/api/auth/refresh")
And (not ip.src in { <optional allowlist CIDRs> }) # optional

Then: Skip (WAF Managed Rules / Bot Fight Mode) OR Set Action: Allow
```

Alternative fine-grained expression (skip only higher sensitivity bot challenges but keep basic rate limiting):
```
(http.request.uri.path starts_with "/api/auth/" and http.request.method in {"POST","GET"})
```

If you want to scope by a special header the script can send (less exposure):
1. Add a custom header in `test-auth.ps1` (e.g. `-H "X-Auth-Probe: 1"`).
2. Use rule expression:
```
(http.request.headers["x-auth-probe"] eq "1")
```

Keep rate limiting separate (a lightweight per-IP rule) to avoid brute force; allow only minimal bypass.

#### Operational Signals
- Rising `edge_auth_challenged == 1` rate: review recent Cloudflare security setting changes or new managed rule updates.
- Persistent fallback usage: confirm the skip rule is active (Rules → Custom Rules list) and not shadowed by a higher-priority block rule.

#### Manual Verification
```
pwsh ./scripts/test-auth.ps1 -Email probe@example.com -Password P@ssw0rd123! -Edge https://app.ledger-mind.org -Origin http://127.0.0.1 -Json | jq
```
Expected fields:
```jsonc
{ "ok": true, "mode": "edge" | "origin_fallback", "challenged": false | true }
```

If `mode=origin_fallback` and `challenged=true`, Cloudflare blocked the initial edge attempt; confirm the WAF rule or reduce challenge sensitivity (turn off Browser Integrity Check for these endpoints only).

#### If the UI Appears Unstyled
Occasionally a stale service worker, aggressive extension (privacy/ad blockers), or cached incorrect MIME type can cause the SPA to load without proper CSS:

1. Open the site in an Incognito/Private or Guest profile with all extensions disabled.
2. Hard-reload (Shift+Reload) to bypass the HTTP cache.
3. Clear any service workers: Chrome DevTools → Application → Service Workers → Unregister.
4. Verify the CSS asset MIME from the edge:
  ```powershell
  curl --ssl-no-revoke -sI https://app.ledger-mind.org/ | findstr /i "Content-Security-Policy"
  curl --ssl-no-revoke -sI https://app.ledger-mind.org/assets/<your-css-hash>.css
  ```
  Expected: `Content-Type: text/css` and CSP header present on index.
5. If MIME is wrong or missing, re-run the lightweight asset probe:
  ```powershell
  pwsh ./scripts/edge-verify-assets.ps1 -Json | jq
  ```
6. Still broken? Flush CDN/browser cache and ensure the deployed `nginx.conf` has the `/assets/` block above the SPA fallback with long-lived immutable caching.

If the CSS MIME is correct and CSP present but styling still fails, inspect DevTools Console for blocked resources (CSP violations) or 404s referencing `/src/` paths (which indicates a build/guard failure).

#### Tunnel Health & Recovery

New tooling hardens tunnel operations:

Targets / Scripts:
| Command | Purpose |
|---------|---------|
| `make port-guard` | Fails if another compose project still binds 80/443/11434 |
| `make tunnel-verify` | Runs strict edge verification (`-TunnelStrict`) including DNS + HA connection threshold |
| `make tunnel-bootstrap` | Generates/refreshes `cloudflared/config.yml` skeleton (credentials not created) |

Strict Mode adds:
- DNS resolution timing (fail if no A records)
- Tunnel metrics parsing (`cloudflared_tunnel_ha_connections`) enforcing `-MinHaConnections` ≥ 1
- Fails build/deploy gate if metrics missing or below threshold.

Bootstrap Flow (first-time or rotated account):
```powershell
cloudflared tunnel login
cloudflared tunnel create ledgermind-prod   # outputs <UUID>.json
```

### Prometheus CSP Edge Metrics & Rules

End-to-end CSP observability includes:

- Probe → pushes CSP hash/length to backend (`/api/metrics/edge`).
- Backend exposes gauges (`edge_csp_policy_length`, `edge_csp_policy_sha{sha="..."}`, `edge_metrics_timestamp_seconds`).
- Recording & alert rules: see `prometheus/rules/csp.yml` and `prometheus/rules/csp_alerts.yml`.
- Manual workflow: `.github/workflows/prom-rules-update.yml` can regenerate/update rule files via a PR.

Add to Prometheus config (example):
```yaml
rule_files:
  - prometheus/rules/*.yml
```

> See `docs/observability-contract.md` for metric/header invariants and resilient test patterns (avoid brittle formatting assumptions).

## E2E Testing

### Running E2E Tests Locally

The E2E suite uses Playwright to test the full stack (backend + frontend). Tests run against a dedicated SQLite database (`test_e2e.db`) that's automatically cleaned before each run for deterministic results.

**Two-Terminal Workflow** (manual control):

```powershell
# Terminal A: Start backend + dev server
./scripts/dev.ps1 -NoOllama

# Terminal B: Run tests
pnpm -C apps/web run test:fast:dev
```

**One-Shot Auto Runner** (spawns backend + vite automatically):

```powershell
pnpm -C apps/web run test:fast:auto
```

The auto-runner:
- Deletes `apps/backend/data/test_e2e.db` for a clean slate
- Spawns backend with `ALLOW_DEV_ROUTES=1` (enables `/api/dev/seed-user`, `/api/dev/seed-unknowns`)
- Spawns Vite dev server with `VITE_SUGGESTIONS_ENABLED=1`, `VITE_UNKNOWNS_ENABLED=1`
- Waits for both to be ready, then runs Playwright tests
- Cleans up processes after tests complete

**Key Features:**
- **Direct Backend Routing:** Tests hit FastAPI directly (port 8000) instead of going through Vite proxy
- **Serialized Execution:** Dev mode runs with `workers: 1` to avoid SQLite lock contention
- **Flake Guards:** CI retries tests once with traces captured on first retry
- **Graceful Degradation:** Tests skip when UI features are unavailable (e.g., suggestions panel missing)

### CI Integration

E2E tests run automatically in CI via `.github/workflows/e2e-dev.yml`. The workflow:
- Installs dependencies (pnpm, Python, Playwright browsers)
- Runs tests with `CI=true` (enables retries and trace capture)
- Uploads Playwright reports and traces as artifacts on failure

## Fast Playwright (Chromium-only local runs)

We provide fast, Chromium-only Playwright runs locally with higher parallelism and a no-webServer pattern (you prestart the app):

- Install browsers:

```powershell
pnpm run pw:install
```

- Fast run (defaults to BASE_URL=http://127.0.0.1:8080; override via env):

```powershell
pnpm run pw:fast
```

- PowerShell helper with shard switches:

```powershell
./scripts/run-playwright.ps1 -BaseUrl http://127.0.0.1:8080
./scripts/run-playwright.ps1 -BaseUrl http://127.0.0.1:5173 -Shard1
```

Environment knobs:

- `BASE_URL`: target base URL (nginx/edge: 8080; vite dev: 5173)
- `PW_WORKERS`: override concurrency (default 24)
- `PW_SKIP_WS=1`: skip Playwright-managed webServer (default in pw:fast)

Badge exposure: coverage/status JSON lives on the `status-badge` branch; see section below for enabling coverage badge.

### Coverage Badge & Workflow Integration

Once test coverage is published (via unit CI writing `coverage-summary.json` to `status-badge`), a shields endpoint JSON (`coverage-shields.json`) is generated and committed to the same branch. Add the badge:

```markdown
![Coverage](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/<USER>/<REPO>/status-badge/coverage-shields.json)
```

Color thresholds (Lines %): 90+=brightgreen, 80+=green, 70+=yellowgreen, 60+=yellow, 50+=orange, else red.

### Pre-Commit Hooks (Husky + lint-staged)

Install dependencies (one-time):
```bash
pnpm add -D husky lint-staged
pnpm exec husky install
```

Sample `package.json` additions:
```jsonc
{
  "scripts": { "prepare": "husky install" },
  "lint-staged": {
    "*.{js,ts,tsx}": [
      "eslint --max-warnings=0",
      "vitest related --run --passWithNoTests"
    ],
    "*.{json,md,yml,yaml}": [
      "eslint --max-warnings=0 --ext .json,.md,.yml,.yaml"
    ]
  }
}
```

Create hook:
```bash
npx husky add .husky/pre-commit "npx lint-staged"
```

Result: staged JS/TS + config/text files are linted and related tests run before commit; CI still performs full, authoritative verification.
copy ~/.cloudflared/<UUID>.json cloudflared/<UUID>.json
make tunnel-bootstrap                       # creates/updates config.yml
docker compose -f docker-compose.prod.yml -f docker-compose.prod.override.yml restart cloudflared
make tunnel-verify
```

If `tunnel-verify` reports `tunnel` critical:
1. Check credentials filename matches the `tunnel:` UUID.
2. Ensure `cloudflared` container log shows connection lines (QUIC/Websocket established).
3. Confirm DNS hostnames map in Cloudflare dashboard to the tunnel.
4. Re-run `make port-guard` to ensure no legacy stack still holds ports.

All JSON outputs can be captured for CI gates:
```powershell
pwsh ./scripts/edge-verify.ps1 -Json -TunnelStrict > edge-verify.json
```

### CI Gate

To block releases when the tunnel, DNS, or TLS certificate is unhealthy:

```powershell
pwsh ./scripts/edge-verify.ps1 -Json -TunnelStrict -MinHaConnections 1 -CertMinDays 14 > edge-verify.json
```

Criticals cause CI failure (`edge-health.yml`). The workflow uploads the JSON artifact for auditing. Add `cert-check` target locally:

```powershell
make cert-check
```

Ensure `cloudflared/<UUID>.json` filename matches `config.yml:tunnel`. Use `make tunnel-bootstrap` (or `./scripts/tunnel-bootstrap.sh` on Linux) after rotating credentials.

Planned enhancements: automated retry/backoff, certificate days-remaining alerting in Slack, and schema validation via `ops/schemas/edge-verify.schema.json`.

### Hostname Binding & Origin Debug

If the tunnel shows healthy HA connections but all edge probes return `000`, verify that each public hostname is actually bound to the active tunnel UUID.

### Frontend Styling Incident Post-Mortem (Sep 2025)
**Impact:** UI appeared unstyled (HTML loaded, CSS not applying) for a single operator session; production users not broadly affected.

**Root Cause:** Client-side interference (extension-injected stylesheet + stale service worker/cache state) caused the loaded hashed CSS bundle to report `cssRules.length === 0` despite being served correctly (200 + `text/css`). Server & build pipeline were healthy.

**Red Herrings:**
- Windows `curl` Schannel revocation errors (`CRYPT_E_NO_REVOCATION_CHECK`) – local trust chain quirk, not edge failure.
- Initial asset probe ordering issue already fixed earlier.

**Server Validation:**
```
curl -sI https://app.ledger-mind.org/assets/<hash>.css | grep -i 'Content-Type'
Content-Type: text/css
```

**Never-Again Kit:**
1. CSP at server scope with `always` + explicit `connect-src` (deployed).
2. `index.html` served `Cache-Control: no-store`; hashed assets long-lived + immutable.
3. Build guard (`scripts/ci/check-built-index.sh`) blocks dev index leakage.
4. Container startup assert (`/docker-entrypoint.d/10-assert-assets.sh`) fails fast if CSS not served with `text/css`.
5. Lightweight asset/CSP probe (`scripts/edge-verify-assets.ps1`) – integrate post-deploy.
6. README runbook for unstyled UI (clear SW/caches, verify MIME, inspect `document.styleSheets`).

**Runbook Snippet:**
```js
navigator.serviceWorker?.getRegistrations?.().then(rs=>rs.forEach(r=>r.unregister()));
caches?.keys?.().then(keys=>keys.forEach(k=>caches.delete(k)));
Array.from(document.styleSheets).map(s=>{try{return{href:s.href,rules:s.cssRules?.length||0}}catch(e){return{href:s.href,error:e.message}}})
```

If server MIME + CSP are correct and rules still 0: open a Guest window (no extensions). If styling returns, isolate the extension.

Quick manual binding (credentials-file mode):
```bash
TUNNEL=6a9e2d7e-9c48-401b-bdfd-ab219d3d4df5
cloudflared tunnel route dns $TUNNEL app.ledger-mind.org
cloudflared tunnel route dns $TUNNEL ledger-mind.org
cloudflared tunnel route dns $TUNNEL www.ledger-mind.org
```

Programmatic (API) binding & verification:
```powershell
# Bind (creates or repairs CNAME -> <UUID>.cfargotunnel.com)
make bind-hosts

# Verify (writes ops/artifacts/cf-hosts.json)
make verify-hosts
```

Internal origin sanity (should show `UP 204` and `READY 200`):
```bash
make origin-check
```

If origin is OK and hostnames are missing or mis-targeted, re-run the binding commands and then rerun strict edge verification:
```powershell
pwsh ./scripts/edge-verify.ps1 -Json -TunnelStrict -MinHaConnections 1 -CertMinDays 14 | jq '.summary'
```

Temporary debug logs (override example):
```yaml
services:
  cloudflared:
    command: ["tunnel","run","--loglevel","debug"]
```
Apply with:
```bash
docker compose -f docker-compose.prod.yml -f docker-compose.prod.override.yml up -d --force-recreate cloudflared
```


### Bootstrap Scripts

Automate first-time or repeat prod stack bring-up with generated secrets, readiness gating, migration drift handling, JSON summaries, and optional authenticated smoke.

PowerShell (Windows):
```powershell
# Fresh full stack; allow missing LLM; 2‑min readiness; auto-migrate if drift
pwsh .\scripts\prod-bootstrap.ps1 -ResetPg -NoLLM -Full -ReadyTimeoutSec 120 -AutoMigrate

# CI-friendly JSON summary + authenticated smoke prompt
pwsh .\scripts\prod-bootstrap.ps1 -Full -Json -SmokeAuth

# Minimal (just postgres+backend, default timeout)
pwsh .\scripts\prod-bootstrap.ps1
```

Bash (Linux / CI):
```bash
./scripts/prod-bootstrap.sh -ResetPg -NoLLM -Full -ReadyTimeoutSec 120 -AutoMigrate -Json
```

Flags:
| Flag | Purpose |
|------|---------|
| `-ResetPg` | Drop and recreate Postgres volume (`pgdata`) |
| `-NoLLM` | Allow startup without an LLM key (sets `DEV_ALLOW_NO_LLM=1` if absent) |
| `-Full` | Also start nginx, agui, cloudflared, certbot, nginx-reloader |
| `-ReadyTimeoutSec <n>` | Max seconds to wait for `/api/status` (db + migrations) |
| `-SmokeAuth` (PS only) | Run full smoke with interactive auth (prompts for password) |
| `-Json` | Emit final machine-readable summary to stdout |
| `-AutoMigrate` | Run `alembic upgrade head` automatically on drift |

Readiness Criteria:
- `/api/status` must report `ok=true`, `db.ok=true`, `migrations.ok=true`, `crypto.ok=true`, `llm.ok=true`.
- With `-Json`, a timeout prints `{ "ok": false, "reason": "timeout", "url": "..." }` and exits non-zero.

Sample Summary (plain):
```
SUMMARY | ok=True db=True mig=True crypto=True llm=True t=42ms url=https://app.ledger-mind.org
```

Sample JSON:
```json
{
  "ok": true,
  "db_ok": true,
  "mig_ok": true,
  "mig_cur": "1a2b3c4d",
  "mig_head": "1a2b3c4d",
  "crypto_ok": true,
  "llm_ok": true,
  "t_ms": 42,
  "drift": false,
  "url": "https://app.ledger-mind.org"
}
```

If drift is detected and `-AutoMigrate` not set, a command hint is printed. With `-AutoMigrate`, migrations are applied and status is re-queried.

Both scripts generate `.env.prod.local` once (idempotent). Delete that file to rotate values.

### Unified Bootstrap Endpoint

The backend exposes a lightweight consolidated status at `/api/status` returning:

```
{
  "ok": true,
  "ts": 1730000000,
  "auth": { "logged_in": false, "email": null },
  "version": { "backend_branch": "main", "backend_commit": "abc1234" },
  "llm": { "ready": true },
  "health": { "ready": true }
}
```

Frontend can call this once at boot to decide whether to render a logged-out shell **without** immediately triggering `/api/auth/me` / charts calls when unauthenticated. This reduces unnecessary 401/404 noise and speeds first paint.

### Post-Deploy Cloudflare Cache Purge (HTML + Current Assets)

After each production rebuild, purge stale cached HTML and reference the newly built hashed assets so users never load an index.html pointing at old JS/CSS.

Quick usage (requires Zone cache purge token):

```powershell
$env:CLOUDFLARE_API_TOKEN="***"
$env:CLOUDFLARE_ZONE_ID="***"
pwsh -File scripts/cf-purge.ps1
```

Or via npm script:

```bash
CLOUDFLARE_API_TOKEN=*** CLOUDFLARE_ZONE_ID=*** npm run cf:purge
```

What it purges:
- / (root)
- /index.html
- All /assets/*.js and *.css referenced in the built `apps/web/dist/index.html`
- Extra entries (default: /site.webmanifest, /favicon.ico)

CI step example:
```yaml
- name: Purge Cloudflare cache
  env:
    CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
    CLOUDFLARE_ZONE_ID: ${{ secrets.CLOUDFLARE_ZONE_ID }}
  run: |
    node scripts/cf-purge.js \
      --base=https://app.ledger-mind.org \
      --dist=apps/web/dist \
      --extra=/site.webmanifest,/favicon.ico
- name: Edge smoke
  run: pwsh -File scripts/smoke-edge.ps1
```

Scripts:
- `scripts/cf-purge.js` (Node implementation)
- `scripts/cf-purge.ps1` PowerShell wrapper

These ensure the CDN never serves stale HTML pointing at removed hashed bundles (avoids text/plain module errors and white screens).

#### Advanced Purge Modes

Changed-only (hash compare on `index.html`):
```bash
npm run cf:purge:changed \
  --silent # (optional) suppress npm prefix
```

Dry run (show what would purge, skip API call):
```bash
npm run cf:purge:dry
```

Direct Node invocation examples:
```bash
node scripts/cf-purge.js \
  --base=https://app.ledger-mind.org \
  --dist=apps/web/dist \
  --onlyIfChanged=1 \
  --snapshot=.cf-purge.last.json

# Force purge even if unchanged (omit onlyIfChanged)
node scripts/cf-purge.js --base=https://app.ledger-mind.org --dist=apps/web/dist

# Dry run + verbose backoff settings
node scripts/cf-purge.js --base=https://app.ledger-mind.org --dist=apps/web/dist --onlyIfChanged=1 --dryRun=1 --retries=3 --backoffMs=400
```

Snapshot file (`.cf-purge.last.json`) persists:
```json
{
  "indexHash": "<sha256>",
  "at": "2025-09-28T19:22:11.311Z",
  "urls": ["https://app.ledger-mind.org/", "https://app.ledger-mind.org/index.html", "..."]
}
```

If `--onlyIfChanged=1` and current `index.html` hash matches `indexHash`, purge is skipped (fast exit 0).

Retry / backoff logic: exponential (2^n) * base `--backoffMs` (+ jitter) on 429 and 5xx up to `--retries` attempts.

Integrate into rebuild:
```powershell
pwsh -File scripts/rebuild-prod.ps1 -PurgeEdge
```
Adds a post-deploy changed-only purge (skips if unchanged, warns if env vars missing).

Environment requirements (unchanged):
```
CLOUDFLARE_API_TOKEN=...  # zone.cache_purge permission
CLOUDFLARE_ZONE_ID=...
```

Flags summary (cf-purge.js):
| Flag | Purpose | Default |
|------|---------|---------|
| `--base` | Public site base URL | (required) |
| `--dist` | Build output directory | `apps/web/dist` |
| `--extra` | CSV extra paths to purge | `/site.webmanifest,/favicon.ico` |
| `--onlyIfChanged` | Skip purge when index hash unchanged | off |
| `--snapshot` | Snapshot JSON path | `.cf-purge.last.json` |
| `--retries` | Retry attempts on 429/5xx | 5 |
| `--backoffMs` | Initial backoff ms | 500 |
| `--dryRun` | Log targets, no API call | off |

Credentials:
- Preferred: `CLOUDFLARE_API_TOKEN` (scoped token: Zone -> Cache Purge:Edit)
- Fallback (auto-detected if no token): `CLOUDFLARE_GLOBAL_KEY` + `CLOUDFLARE_EMAIL`

CI Dry-Run Workflow:
The workflow `cloudflare-purge-smoke.yml` performs a scheduled and on-change dry-run purge to ensure the script stays healthy without mutating cache:
```yaml
- name: Cloudflare purge dry-run (sanity)
  env:
    CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
    CLOUDFLARE_ZONE_ID:   ${{ secrets.CLOUDFLARE_ZONE_ID }}
  run: |
    node scripts/cf-purge.js \
      --base=https://app.ledger-mind.org \
      --dist=apps/web/dist \
      --extra=/site.webmanifest,/favicon.ico \
      --dryRun=1
```

Result codes:
| Exit | Meaning |
|------|---------|
| 0 | Purge success OR skipped (unchanged / dry-run) |
| 1 | Purge attempted and failed after retries |
| 2 | Usage / configuration error |

Operational recommendation: run changed-only purge in deploy pipeline; schedule a weekly full purge (without `--onlyIfChanged`) if you rotate rarely referenced assets.

## Environment Variables (Core Selection)

| Variable | Required | Description |
|----------|----------|-------------|
| `ENCRYPTION_ENABLED` | yes (prod) | `1` enables envelope encryption / KMS mode when credentials present |
| `GOOGLE_APPLICATION_CREDENTIALS` | yes | Path inside container to SA JSON (`/secrets/gcp-sa.json`) |
| `GCP_KMS_KEY` | yes (KMS) | Full resource id of KEK (see example above) |
| `GCP_KMS_AAD` | recommended | Additional authenticated data (e.g. `app=ledgermind,env=prod`) |
| `MODEL` | yes | Primary local model (e.g. `gpt-oss:20b`) |
| `OPENAI_BASE_URL` | optional | Fallback or alt provider base (Ollama/vLLM) |
| `OPENAI_API_KEY` / `OPENAI_API_KEY_FILE` | optional | Fallback LLM key; file path used in prod secret mount |
| `DISABLE_PRIMARY` | optional | `1` forces using fallback only (diagnostics) |
| `DEV_ALLOW_NO_LLM` | optional | Allow deterministic stubs when no model up (non-prod) |

Secrets policy: `secrets/` is git-ignored; place SA JSON under `secrets/gcp-sa.json/`.

## Services Overview

```
Browser ⇄ Cloudflare Edge ⇄ cloudflared (tunnel) ⇄ nginx (reverse proxy / static) ⇄ backend (FastAPI) ⇄ Postgres
                                                              └── ollama (LLM runtime)
                                                              └── agui (SSE gateway)
```

## Verification & Operations Docs

| Topic | Doc |
|-------|-----|
| Deployment readiness & curls | [`VERIFY_PROD.md`](docs/VERIFY_PROD.md) |
| Deployment checklist | [`DEPLOY_CHECKLIST.md`](docs/DEPLOY_CHECKLIST.md) |
| Cloudflare tunnel issues | [`TROUBLESHOOTING_CLOUDFLARE_TUNNEL.md`](docs/TROUBLESHOOTING_CLOUDFLARE_TUNNEL.md) |
| Crypto / KMS setup | [`CRYPTO_SETUP.md`](docs/CRYPTO_SETUP.md) |
| LLM primary & fallback config | [`LLM_SETUP.md`](docs/LLM_SETUP.md) |
| Smoke scripts overview | [`SMOKE_TESTS.md`](docs/SMOKE_TESTS.md) |
| Architecture overview | [`ARCHITECTURE.md`](docs/ARCHITECTURE.md) |
| Testing strategy | [`TESTING.md`](docs/TESTING.md) |
| Security posture | [`SECURITY.md`](docs/SECURITY.md) |
| Day-2 operations | [`OPERATIONS.md`](docs/OPERATIONS.md) |
| Contributing guide | [`CONTRIBUTING.md`](docs/CONTRIBUTING.md) |
| Changelog | [`CHANGELOG.md`](CHANGELOG.md) |

## Common Issues & Fixes

| Symptom | Cause | Fix |
|---------|-------|-----|
| `crypto_ready:false` on /ready | SA JSON missing or `ENCRYPTION_ENABLED=0` | Mount file at `/secrets/gcp-sa.json`, set env, restart backend |
| 502 via edge, internal 200 | HTTPS origin mismatch (cloudflared → https://nginx:443, nginx only on :80) | Update tunnel ingress to `http://nginx:80` (see tunnel doc) |
| `models_ok` = `unknown` | Frontend expecting legacy `/llm/models` | Use `/agent/models` or rely on `useLlmStore().modelsOk` |
| Falling back to stub LLM | Primary model not loaded yet | Wait for Ollama pull / remove `DISABLE_PRIMARY` |

### Dev Postgres Password Mismatch

If the backend keeps restarting with `FATAL:  password authentication failed for user "myuser"` it usually means the persisted Postgres volume was initialized with a different password than the one currently exported / in `.env.dev`.

Non‑destructive fix (preferred):

```powershell
# 1. Exec into the running postgres container using local trust auth
docker exec ledgermind-dev-postgres-1 psql -U myuser -d postgres -c "ALTER ROLE myuser WITH PASSWORD 'changeme';"

# 2. Export the same password for compose interpolation (new shell or before starting backend)
$env:POSTGRES_PASSWORD='changeme'

# 3. Restart (or start) only the backend so it picks up the correct password
docker compose -f docker-compose.dev.yml -p ledgermind-dev up -d backend

# 4. Verify
curl -s http://127.0.0.1:8000/health/simple
```

Destructive reset (if you do NOT need existing dev data):
```powershell
docker compose -f docker-compose.dev.yml -p ledgermind-dev down
docker volume rm ledgermind-dev_pgdata
$env:POSTGRES_PASSWORD='changeme'
docker compose -f docker-compose.dev.yml -p ledgermind-dev up -d
```

Tip: Always ensure your shell has `POSTGRES_PASSWORD` exported before bringing up `backend` so that `DATABASE_URL` is interpolated correctly. The helper script will attempt to read it from `.env.dev.local` / `.env.dev`, but an explicit export avoids ambiguity.


---

Offline-first finance agent with local inference via Ollama or vLLM. Designed for the Open Models hackathon.
- **Agentic**: function-calling tools for categorization, rules, budgets, and insights
- **Local**: point to your local LLM server (Ollama or vLLM) via env
- **Applies gpt-oss uniquely**: on-device, function-calling agent that explains its reasoning ("Explain Signal") and learns from user feedback (train->reclassify loop).
- **Natural Language Interface**: Revolutionary conversational transaction explanations - just say "Explain this coffee charge" and it works automatically.
- **Production-Grade Architecture**: Robust Pydantic validation, smart context trimming, PII redaction, and comprehensive hermetic test coverage.
- **Performance Optimized**: HTTP client reuse, token-aware context management, and intent-specific system prompts for better LLM responses.
- **Design**: clean UX, resilient states, deduped suggestions, one-click "Auto-apply best" with threshold.
- **Impact**: turns messy bank CSVs into actionable budgets & insights locally.
- **Novelty**: "Explain" turns category predictions into transparent traces (rules + LLM rationale).
- **Safe UX**: optimistic UI, loading/error states, no duplicate suggestions, explain-why
- **Smart Chat**: unified `/agent/chat` endpoint with natural language transaction explanations and auto-context enrichment

## Troubleshooting

If something feels off (e.g., API returns HTML, login refresh quirks, Cloudflare tunnel issues), see `troubleshooting.md` for quick fixes and copy-paste checks.

## ≡ƒÜÇ New: Enhanced Agent Chat System

### **Natural Language Transaction Explanations**
Now supports conversational transaction explanations without requiring explicit transaction IDs:
```bash
# Before: Required specific transaction ID
curl -X POST http://127.0.0.1:8000/agent/chat \
  -d '{"messages":[{"role":"user","content":"Explain transaction 123"}], "intent":"explain_txn", "txn_id":"123"}'

# After: Natural language works automatically
curl -X POST http://127.0.0.1:8000/agent/chat \
  -d '{"messages":[{"role":"user","content":"Explain this $4.50 coffee charge"}], "intent":"explain_txn"}'
```

### **Key Features**
- **≡ƒñû Smart Fallback**: Automatically finds relevant transactions when ID is missing
- **≡ƒÄ» Intent-Specific Behavior**: Specialized responses for `general`, `explain_txn`, `budget_help`, `rule_seed`
- **≡ƒôè Rich Citations**: Comprehensive context metadata (`summary`, `rules`, `merchants`, `alerts`, `insights`, `txn`)
- **ΓÜí Performance Optimized**: Smart context trimming and HTTP client reuse
- **≡ƒöÉ Privacy Protected**: PII redaction for secure logging
- **Γ£à Production Ready**: Full Pydantic validation with comprehensive test coverage

### **Agent Chat API**
```typescript
// TypeScript API (apps/web/src/lib/api.ts)
type AgentChatRequest = {
  messages: { role: 'system'|'user'|'assistant', content: string }[];
  context?: any;
  intent?: 'general'|'explain_txn'|'budget_help'|'rule_seed';
  txn_id?: string | null;
  model?: string;
  temperature?: number;
  top_p?: number;
};

type AgentChatResponse = {
  reply: string;
  citations: { type: string; id?: string; count?: number }[];
  used_context: { month?: string };
  tool_trace: any[];
  model: string;
};
```

### Web UI: ChatDock updates (Sep 2025)
- Unified messages stream persisted in `localStorage` at `financeAgent.chat.messages.v1` with crossΓÇætab sync via `BroadcastChannel`.
- Hydrates on mount and auto-scrolls to the latest message; history renders from the same stream.
- Header actions: Export chat as JSON or Markdown; History toggle; Tools toggle (with Lucide ChevronUp/Wrench icons).
- Accessible toggle uses `aria-expanded` + `aria-controls="agent-tools-panel"`; the tools panel is labeled with that id.
- Tiny tool presets run through `/agent/chat` and append back into the same messages stream; duplicate inline quick tools removed.
- Model selection (Advanced) is saved per-tab in `sessionStorage` under `fa.model`; leave blank to use backend default.
- ΓÇ£ExplainΓÇ¥ and other entry points now funnel into the same chat, so everything is captured and restorable.

### Backend resilience updates (Sep 2025)
- Insights enrichment is optional and non-fatal during `/agent/chat` context building; failures donΓÇÖt block a reply.
- Added a minimal `ExpandedBody` + `expand(...)` helper to normalize insights payloads defensively.
- Normalized citations and `used_context.month` metadata are returned to support UI annotations.

Tips
- Open the ChatDock from the floating bubble (≡ƒÆ¼) or with Ctrl+Shift+K.
- Export buttons live in the header (JSON/Markdown).
- The model selection (Advanced) is saved per tab; leave blank to use the backend default.
- Clearing the chat resets the persisted stream (synced across this browserΓÇÖs tabs).

## Quickstart

### Prereqs
- Python 3.11+
- Node 20+ (pnpm recommended)
- One local LLM server:
  - **Ollama**: `ollama run gpt-oss:20b`
  - **vLLM** (OpenAI-compatible): `python -m vllm.entrypoints.openai.api_server --model <path-or-hf-id>`

### 1) Configure env
```bash
cp .env.example .env
# Edit .env as needed
```

### 2) Backend
```bash
cd apps/backend
python -m venv .venv && source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -U pip
pip install -e .
uvicorn app.main:app --reload --port 8000
```
#### Create an admin user (CLI)
Once the backend is running (or inside the backend container), you can create/update a user and assign roles:

```bash
# Create or update a user and set roles (space-separated)
python -m app.cli users create --email "you@example.com" --password "changeme" --roles admin analyst user

# Alias form (same behavior)
python -m app.cli user-create --email "you@example.com" --password "changeme" --roles admin analyst user
```

Alternatively, seed the default admin:

```bash
python -m app.scripts.seed_admin   # admin@local / admin123
```

### 3) Frontend
```bash
cd ../../apps/web
npm i -g pnpm || true
pnpm install
pnpm dev  # http://localhost:5173/app/
```
Log in at http://localhost:5173/ with either your created user or the seeded admin credentials.

### 4) Load sample data
In the web UI, go to **CSV Ingest** and upload `transactions_sample.csv` from `apps/backend/app/data/samples/`.

---

# Finance Agent ΓÇö Setup & Notes

This branch (UI-update) focuses on UI/UX refinements and stability: unified toasts (single Toaster), actionable CTA toasts with smooth scroll to anchors, shared scroll helper, and removal of deprecated insights summary usage.

Complete test coverage with zero external dependencies:
- **ΓÜí Lightning Fast**: Tests run in seconds instead of minutes
- **≡ƒÄ» CI/CD Ready**: Works in any environment without API keys
- **≡ƒôï Comprehensive Coverage**: 15+ test scenarios covering all functionality
pytest tests/test_agent_chat.py -v


**Global Month Auto-Run**
- On UI startup, fetches `/agent/tools/meta/latest_month`.
- Auto-triggers "Insert Context" whenever month changes.
- Debounced + guarded to prevent "second click glitch."

**UI Upload Flow Simplified**
- Removed checkbox for "expenses are positive."
- Upload panel now just posts to `/ingest?replace=...`.
- Backend automatically infers if expenses should be flipped.

### Backend

**Meta Endpoints**
- `/agent/tools/meta/version` ΓåÆ shows current git branch + commit.
- `/agent/tools/meta/latest_month` ΓåÆ shows latest month in DB (e.g. "2025-08").

**CSV Ingest Improvements**
- New auto-detection logic: if most expense-like rows are positive, amounts are flipped automatically.
- Heuristic: ignores obvious income (payroll, deposits, refunds, etc.), samples up to 200 rows.
- Adds `flip_auto` field in response if flip was inferred.

Response shape:
```json
{ "ok": true, "added": 10, "count": 10, "flip_auto": true }
```

### Database
- Transactions table must exist (`alembic upgrade head` in backend container).
- Example:
```bash
docker exec -it finance-pg psql -U myuser -d finance -c "SELECT month, COUNT(*) FROM transactions;"
```

## ≡ƒÜÇ Local Dev via Docker Compose
### 1. Build & start stack
```bash
docker compose down -v   # optional: nuke DB volume
docker compose up --build
```

### 2. Run migrations
```powershell
$BE = (docker ps --format "{{.Names}}" | Select-String -Pattern "backend" | ForEach-Object { $_.ToString() })
docker exec -it $BE alembic upgrade head
```

### 2.1. Create an admin (in-container)
```powershell
docker exec -it $BE python -m app.cli users create --email "you@example.com" --password "changeme" --roles admin analyst user
# or seed default:
docker exec -it $BE python -m app.scripts.seed_admin
```

### 3. Ingest CSV
Example with provided sample:
```powershell
curl.exe -X POST `
  -F "file=@C:\ai-finance-agent-oss\apps\backend\app\data\samples\transactions_sample.csv" `
  "http://127.0.0.1:8000/ingest?replace=true"
```

Response should include `"flip_auto": true` if your CSV has positive expenses.

### 4. Verify
```powershell
# Check latest month
# DB peek
docker exec -it finance-pg psql -U myuser -d finance -c "SELECT MAX(date), month, COUNT(*) FROM transactions GROUP BY month ORDER BY month DESC;"
```

## Γ£à Expected Behavior
- On UI startup ΓåÆ global month is set to latest (2025-08 with sample CSV).
- After CSV upload ΓåÆ global month updates automatically, charts & insights refresh.
- Insert Context ΓåÆ auto-runs whenever month changes (no more manual clicks needed).
- Run Button ΓåÆ works without glitching on second click.
- Expenses ΓåÆ correctly negative regardless of CSV sign convention.

## ≡ƒöº Troubleshooting

**`web-1 exited with code 1` during compose**
ΓåÆ Make sure `smoke-backend.ps1` is not called in containerized environments (Windows-only).

**`relation "transactions" does not exist`**
ΓåÆ Run migrations inside backend container:
```bash
docker exec -it <backend_container> alembic upgrade head
```

**Latest month looks wrong**
ΓåÆ Check DB directly:

## Runtime Diagnostics: /config Endpoint

`GET /config` returns a lightweight, non-sensitive snapshot of runtime flags to help verify deployment behavior:

Field | Meaning
----- | -------
`env` | Current environment (dev / prod / etc.)
`debug` | Whether debug mode is enabled
`help_rephrase_default` | Default value used when `rephrase` query param is omitted on `/agent/describe/*`
`help_cache` | Object with `hits`, `misses`, and `size` (entry count) for the help/describe TTL cache

Example:
```json
{
  "env": "dev",
  "debug": true,
  "help_rephrase_default": true,
  "help_cache": {"hits": 12, "misses": 4, "size": 3}
}
```

## Dev Override: Enabling Rephrase Locally

By default the LLM rephrase polish is only active in production. To exercise the rephrase path (and provider fallback) in dev without faking `ENV=prod`, set:

```
LLM_ALLOW_IN_DEV=1
HELP_REPHRASE_DEFAULT=1
```

You can inject these via `docker-compose.override.yml`:

```yaml
services:
  backend:
    environment:
      - LLM_ALLOW_IN_DEV=1
      - HELP_REPHRASE_DEFAULT=1
```

Then restart the backend container. Subsequent `POST /agent/describe/<panel>?rephrase=1` calls should return `rephrased: true` (unless the model response equals the deterministic base text).

## Help Cache Stats

The in-memory help cache tracks simple counters:

Metric | Definition
------ | ----------
`hits` | Successful cache lookups (non-expired)
`misses` | Key not found or expired
`size` | Current number of live (non-expired) entries

These reset on backend restart or when the cache is cleared in tests.
```bash
docker exec -it finance-pg psql -U myuser -d finance -c "SELECT MAX(date) FROM transactions;"
```

## Admin

Operations helpers:

- `POST /admin/help-cache/reset` — clears the help describe cache and resets its counters.
  - Optional header: `x-admin-token: $ADMIN_TOKEN` (enforced only if `ADMIN_TOKEN` env var is set)

Example (PowerShell):
```powershell
Invoke-RestMethod -Method POST http://127.0.0.1:8000/admin/help-cache/reset -Headers @{ "x-admin-token" = $env:ADMIN_TOKEN }
```

## Metrics

If Prometheus is enabled (either via `prometheus_fastapi_instrumentator` or manual mounting), the help cache also exports:

- `help_cache_hits_total`
- `help_cache_misses_total`
- `help_cache_evictions_total`
- `help_cache_entries` (gauge)

These update in real time; eviction increments occur when an expired entry is accessed.

## LLM Gating

All LLM usage is centralized through `llm_policy(mode)` in `app/services/llm_flags.py`.

Precedence (highest wins):

1. `FORCE_LLM_TESTS=1` – test-only override; forces allow (sets `forced=True`).
2. `DEV_ALLOW_NO_LLM=1` – global dev/test off switch (`globally_disabled=True`).
3. `LLM_ALLOW_IN_DEV=1` – allow in non-prod environments.
4. Production default: allow when `ENV=prod` (or `APP_ENV=prod`) and `DEBUG` is not truthy.

`llm_policy` returns a dict: `{ allow: bool, forced: bool, globally_disabled: bool }`.

Callers (describe, explain, chat) request a policy via `llm_policy("help"|"explain"|"chat")` and must treat `allow` as authoritative. Query params like `?use_llm=1` act only as hints; the policy decides final permission.

### LLM gating in tests

Use these env vars to exercise different paths:

- Force on (tests only): `FORCE_LLM_TESTS=1`
- Global dev disable: `DEV_ALLOW_NO_LLM=1`
- Allow in dev: `LLM_ALLOW_IN_DEV=1`

Precedence: `FORCE_LLM_TESTS` > `DEV_ALLOW_NO_LLM` > `LLM_ALLOW_IN_DEV` > prod fallback.

When `globally_disabled` is true we also purge any cached rephrased variants to avoid serving stale LLM outputs.


---

## Month handling and data refresh
- The app initializes the UI month from your data automatically by calling the transactions search tool without a month; the backend returns the latest month it finds.
- Charts endpoints require an explicit `month`. The UI always passes it, and the Chat Dock auto-injects the current month for month-required tools.
- After a successful CSV upload, the app snaps the global month to the latest available and refreshes dashboards in the background (non-blocking).

## UI updates (Sep 2025)
- Unified notifications with a single shadcn-style Toaster mounted once in the web app.
- Added CTA-rich success toasts across key actions (rule create/apply, unknowns seed, CSV upload) with buttons to jump to charts or unknowns.
- Introduced page anchors (`#charts-panel`, `#unknowns-panel`, `#rule-tester-anchor`) plus a shared `scrollToId` helper for smooth in-page navigation.

## Environment
- `OPENAI_BASE_URL` (e.g. `http://localhost:11434/v1` for Ollama, or your vLLM URL)
- `OPENAI_API_KEY` (dummy like `ollama` for Ollama, or your real key for remote servers)
- `MODEL` (default `gpt-oss:20b`)
- `DEV_ALLOW_NO_LLM=1` to use deterministic stubbed suggestions if LLM is down

### OpenAI key via Docker secret (prod)

In production, avoid passing `OPENAI_API_KEY` via environment variables.

- Put your key in `./secrets/openai_api_key` (file contents is just the key string, no quotes or KEY= prefix).
- Do not commit this file. The repo already ignores `secrets/` and keeps `secrets/.keep` for the folder.
- Compose mounts it at `/run/secrets/openai_api_key` and sets `OPENAI_API_KEY_FILE` for the backend in `docker-compose.prod.yml`.
- The backend loads the key from `OPENAI_API_KEY` (env) when present (dev/local), otherwise from `OPENAI_API_KEY_FILE` (defaults to `/run/secrets/openai_api_key`).

Verify (PowerShell):

1) Rebuild and start backend with prod compose overrides:
  - $files = @('-f','docker-compose.prod.yml','-f','docker-compose.prod.override.yml')
  - docker compose $files up -d --build backend

2) Check secret is mounted inside the container:
  - $be = (docker ps --format "{{.Names}}" | Select-String "backend").ToString()
  - docker exec -it $be sh -lc 'ls -l /run/secrets && wc -c </run/secrets/openai_api_key'

3) Functional smoke:
  - curl -s -i https://app.ledger-mind.org/agent/chat -H "Content-Type: application/json" --data '{"messages":[{"role":"user","content":"ping"}],"stream":false}'

Expected: 200 (or friendly response) and no server-side "missing_config" errors if the secret file exists.

Windows note (Docker Desktop): if you hit a bind mount error for `secrets/openai_api_key`, use the local override to pass the key via env just for local prod testing:

1) In PowerShell for the current session only:
  - `$env:OPENAI_API_KEY = '<your-key-here>'`
2) Start backend with prod compose overrides:
  - `docker compose -f docker-compose.prod.yml -f docker-compose.prod.override.yml up -d backend`
3) In real production on Linux hosts, keep using the Docker secret mount (more secure) and do not pass the key as an env var.

### Analytics retention (prod)

To keep analytics data bounded over time, the backend can run a small background job in production that prunes old rows from `analytics_events`.

- ANALYTICS_RETENTION_DAYS: days of data to keep (default 90)
- ANALYTICS_RETENTION_INTERVAL_HOURS: how often to prune (default 24)

Notes
- The job only runs when `APP_ENV=prod` (or `ENV=prod`).
- Pruning is a simple `DELETE FROM analytics_events WHERE server_ts < :cutoff` and works for both Postgres and SQLite.
- A Postgres partial index on the hot event `chat_fallback_used` is included via Alembic for faster queries:
  - idx_ae_fallback_event on `server_ts` where `event='chat_fallback_used'`.

After pulling this change, apply migrations:

PowerShell (Docker)
1) $BE = (docker ps --format "{{.Names}}" | Select-String -Pattern "backend").ToString()
2) docker exec -it $BE alembic upgrade head

Bare metal (venv)
- From `apps/backend`, ensure your venv is active and Alembic is installed, then run:
  - python -m pip install --upgrade pip setuptools wheel alembic
  - python -m alembic upgrade head

Verification
- On Postgres: `\di+ idx_ae_*` should show the new partial index.
- Logs will periodically include `analytics_retention: pruned <N> rows...` when enabled.

### Grafana dashboard: Fallback analytics

We ship a ready-to-import Grafana dashboard JSON for monitoring LLM fallback behavior and rates:

- File: `ops/grafana/ledgermind-fallback-dashboard.json`
- Datasource: PostgreSQL (select your Postgres datasource during import)

Import steps
1) In Grafana, go to Dashboards → New → Import.
2) Upload the JSON file from `ops/grafana/ledgermind-fallback-dashboard.json`.
3) When prompted, choose your PostgreSQL datasource and click Import.

Panels included
- Fallbacks (count) over time filtered by the dashboard time range.
- Fallbacks by provider (stacked), reading `props_json->>'provider'`.
- Fallback rate = fallbacks / chat attempts per minute.

## Repo layout
```
apps/
  backend/   - FastAPI app (ingest, charts, insights, agent tools, tests)
  web/       - Vite/React web app (UI, charts, chat)
scripts/     - Windows helpers (dev, run-ollama)
docker-compose.yml
```

## Dev scripts (Windows)
- `scripts/dev.ps1` ΓÇö starts Ollama (pulls model), backend (Uvicorn), and frontend (Vite) in parallel and streams logs.
  - Parameters: `-Model gpt-oss:20b` (default), `-Py .venv/\Scripts/\python.exe` to point at your venv.
- `scripts/run-ollama.ps1` ΓÇö ensures Ollama is running, pulls the model, and performs a quick generation test.

Tip: In PowerShell, you may need to allow script execution for your repo path: `Set-ExecutionPolicy -Scope Process Bypass`.

## Encryption & Key Management (Sep 2025)

The backend now supports envelope encryption for sensitive free‑text fields on transactions (`description`, `merchant_raw`, `note`).

Core concepts
- **DEK (Data Encryption Key)**: 32‑byte key used to encrypt individual field values (AES‑GCM). Stored only wrapped.
- **KEK / KMS**: Either a symmetric key from env (`ENCRYPTION_MASTER_KEY_BASE64` / `MASTER_KEK_B64`) or a Google Cloud KMS key (`GCP_KMS_KEY`) that wraps the DEK.
- **Labels**: Each wrapped DEK row in `encryption_keys` has a `label` (e.g. `active`, `rotating::<ts>`, `retired::<ts>`). Writes reference the current write label (cached via `encryption_settings.write_label`).
- **Hybrid Properties**: ORM exposes `*_text` accessors that transparently encrypt/decrypt using the in‑process decrypted DEK.

Minimal setup (env KEK mode)
```bash
export ENCRYPTION_ENABLED=1
export ENCRYPTION_MASTER_KEY_BASE64=$(openssl rand -base64 32)
alembic upgrade head
python -m app.cli crypto-init     # creates + caches active DEK
```

KMS mode (GCP Cloud KMS)
```bash
export GCP_KMS_KEY="projects/<proj>/locations/<loc>/keyRings/<ring>/cryptoKeys/<key>"
# Optional additional authenticated data
export GCP_KMS_AAD="finance-agent-v1"
alembic upgrade head
python -m app.cli crypto-init
```

Status & demo
```bash
python -m app.cli crypto-status
python -m app.cli txn-demo --desc "Latte" --raw "Blue Bottle #42" --note "extra foam"
python -m app.cli txn-show-latest
```

Key lifecycle
1. `crypto-init` unwraps & caches the active DEK (env or KMS wrapped).
2. Application encrypts new writes to encrypted columns with current DEK; legacy plaintext columns (if any) are backfilled via script.
3. Rotation uses a generate → re‑encrypt → finalize pattern.

DEK rotation (multi‑step)
```bash
# 1) Begin: insert new rotating::<ts> row & set as write label
python -m app.cli dek-rotate-begin

# 2) Re-encrypt batches from old label to new (repeat until remaining=0)
python -m app.cli dek-rotate-run --new-label rotating::20250920T120501

# 3) Finalize: promote rotating label to active, retire old active
python -m app.cli dek-rotate-finalize --new-label rotating::20250920T120501
```

KEK rewrap (fast, no data rewrite)
```bash
# Generate a new KEK and rewrap active DEK
NEW=$(openssl rand -base64 32)
python -m app.cli kek-rewrap --new-kek-b64 "$NEW"
# Or move env-wrapped DEK into KMS mode
python -m app.cli kek-rewrap-gcp
```

Force new active DEK (only when no encrypted rows yet)
```bash
python -m app.cli force-new-active-dek
```

Backfill legacy plaintext → encrypted columns
```bash
python -m app.scripts.encrypt_txn_backfill_splitcols
```

Operational guidance
- ALWAYS back up `encryption_keys` table alongside your data before rotations.
- Treat loss of KEK / KMS permissions as catastrophic: you cannot decrypt existing ciphertext.
- Use `crypto-status` in readiness probes if you need to ensure DEK is cached before serving traffic.
- Logs intentionally omit plaintext; debug locally if you need plaintext visibility.

Testing
- Hermetic tests run with DEV flags; encryption tests cover KEK/KMS unwraps and rotation scaffolding.
- To simulate KMS locally, leave `dek_wrap_nonce` NULL and set `GCP_KMS_KEY` (mock implementation or skip).

Future hardening ideas
- Add per-field metadata hashing for tamper detection.
- Integrate envelope key rotation metrics into a Prometheus endpoint.
- Streaming re-encryption job scheduler for large datasets.

Deep dive: see `docs/encryption.md` for rotation vs rewrap diagrams, metrics, and recovery scenarios.


## Agent Chat
- Minimal chat is available in the web app (uses backend `POST /agent/chat`).
- Point `OPENAI_BASE_URL` and `OPENAI_API_KEY` to your local/remote LLM server; default model is `gpt-oss:20b`.

## Agent Tools: Insights and Charts

### Insights (expanded)
POST `/agent/tools/insights/expanded`

Request (example):

```json
{ "month": "2025-08", "large_limit": 10 }
```

Notes
- This replaces prior summary-style endpoints. Legacy `/report` and `/insights/summary` are deprecated/removed.
- `month` is optional; when omitted, the backend uses the latest month in your data.
- Response includes `summary` (income/spend/net), `mom` deltas when available, `unknown_spend`, `top_categories`, `top_merchants`, `large_transactions`, and basic `anomalies`.

### Charts (month required)
POST `/agent/tools/charts/summary`

```json
{ "month": "2025-08" }
```

POST `/agent/tools/charts/merchants`

```json
{ "month": "2025-08", "limit": 10 }
```

POST `/agent/tools/charts/flows`

```json
{ "month": "2025-08" }
```

POST `/agent/tools/charts/spending_trends`

```json
{ "months": ["2025-03", "2025-04", "2025-05", "2025-06", "2025-07", "2025-08"], "order": "asc" }
```

Notes
- Charts endpoints require a month (or months list for trends). The UI injects the selected month automatically.

## Dev tips
- Windows PowerShell: activate venv with `.venv\Scripts\Activate.ps1`.
- Optional backend smoke check script lives under `apps/backend/app/scripts/smoke-backend.ps1` (used by the web smoke script).

## Why this will impress judges
- **Applies gpt-oss uniquely**: on-device, function-calling agent that explains its reasoning (ΓÇ£Explain SignalΓÇ¥) and learns from user feedback (train->reclassify loop).
- **Design**: clean UX, resilient states, deduped suggestions, one-click ΓÇ£Auto-apply bestΓÇ¥ with threshold.
- **Impact**: turns messy bank CSVs into actionable budgets & insights locally.
- **Novelty**: ΓÇ£ExplainΓÇ¥ turns category predictions into transparent traces (rules + LLM rationale).

## Agent Tools: Budget

### 1) Summary
POST `/agent/tools/budget/summary`

Request:

```json
{ "month": "2025-08", "top_n": 5 }
```

Response (shape):

```json
{
  "month": "2025-08",
  "total_outflows": 263.08,
  "total_inflows": 5000.0,
  "net": 4736.92,
  "unknown_count": 1,
  "by_category": [{ "category": "Groceries", "spend": 185.25, "txns": 2 }, ...],
  "top_merchants": [{ "merchant": "Costco", "spend": 120.0, "txns": 1 }, ...]
}
```

### 2) Check
POST `/agent/tools/budget/check`

Request:

```json
{
  "month": "2025-08",
  "limits": { "Groceries": 200, "Transport": 50, "Shopping": 100, "Subscriptions": 20 },
  "include_unknown": true
}
```

Response (shape):

```json
{
  "month": "2025-08",
  "items": [
    { "category": "Groceries", "limit": 200.0, "spend": 185.25, "remaining": 14.75, "utilization": 0.926 }
  ],
  "totals": { "spend": 263.08, "limit": 370.0, "remaining": 106.92, "utilization": 0.711 }
}
```

Notes

- Outflows are treated as positive spend (absolute value of negative amount).
- Unknown categories include NULL, empty string, and "Unknown" case-insensitive.
- `top_n` caps categories / merchants returned by the summary.

---

## 4) Run just these tests

```bash
cd apps/backend
.\.venv\Scripts\python.exe -m pytest -q tests/test_agent_tools_budget.py --maxfail=1
```
