## ------------------------------------------------------------------
## Convenience targets for dev vs prod stack
## ------------------------------------------------------------------
.PHONY: dev-up dev-down prod-up prod-down stop

dev-up:
	docker compose -f docker-compose.dev.yml -p ledgermind-dev up -d

dev-down:
	docker compose -f docker-compose.dev.yml -p ledgermind-dev down

prod-up:
	docker compose -f docker-compose.prod.yml -f docker-compose.prod.override.yml -p ai-finance-agent-prod up -d

prod-down:
	docker compose -f docker-compose.prod.yml -f docker-compose.prod.override.yml -p ai-finance-agent-prod down

# Rebuild prod images (backend, web, nginx, agui) with cache bust + pull then bring stack up
.PHONY: rebuild-prod
rebuild-prod:
	pwsh ./scripts/rebuild-prod.ps1 -Pull -NoCache

stop:
	docker compose down || true

# ------------------------------------------------------------------
# Prod-local convenience target: spin up production-like stack locally
# Mirrors docs/PROD_LOCAL_RUNBOOK.md steps (hash render, build nginx, up stack, health checks)
# Usage: make prod-local [FAST=1] [NGINX_ONLY=1]
#   FAST=1       Skip image rebuild (only ensure CSP hash render + up)
#   NGINX_ONLY=1 Start only nginx service first (then user can manually bring others)
# Health summaries printed at end; failures don't abort entire sequence.
# ------------------------------------------------------------------
.PHONY: prod-local prod-local-down detect-port prod-local-auto

PORT?=80

detect-port:
	@powershell -NoProfile -ExecutionPolicy Bypass -File scripts/edge-port.ps1 -VerboseWarn | tee .edge_port > NUL
	@echo Selected port: $$(type .edge_port 2>NUL || cat .edge_port)

prod-local-auto: detect-port
	@$(MAKE) prod-local PORT=$$(type .edge_port 2>NUL || cat .edge_port)

.PHONY: edge-port-strict
edge-port-strict:
	@powershell -NoProfile -ExecutionPolicy Bypass -File scripts/edge-port.ps1 -FailOnMulti | tee .edge_port > NUL
	@if not exist .edge_port (echo "[strict] failed to determine edge port" && exit 1) else ( \
		set /p P=<.edge_port & echo [strict] EDGE_PORT=%P% & if not %P%==80 ( echo [strict] ERROR: expected port 80 & exit 2 ) )

prod-local:
	@echo "[prod-local] Step 0: ensuring dev stack not conflicting (best-effort)" && \
	docker ps --format "table {{.Names}}\t{{.Ports}}" | findstr /i "dev" || true ; \
	echo "[prod-local] Step 1: rendering CSP hashes" && \
	pnpm -C apps/web run csp:hash || echo "[prod-local] WARN: csp:hash failed (continuing)" ; \
	set FILES=-f docker-compose.prod.yml -f docker-compose.prod.override.yml && \
	if not defined FAST ( \
	  echo "[prod-local] Step 2: building nginx image" && docker compose %FILES% build nginx \
	) else ( echo "[prod-local] FAST=1 -> skipping nginx build" ) && \
	if defined NGINX_ONLY ( \
	  echo "[prod-local] Step 3: starting nginx only" && docker compose %FILES% up -d nginx \
	) else ( \
	  echo "[prod-local] Step 3: starting full stack" && docker compose %FILES% up -d \
	) && \
	echo "[prod-local] Step 4: basic local health probes" && \
	(for %%%%u in (_up ready metrics api/healthz) do @curl -s -o NUL -w "%%%%u %{http_code}\n" http://127.0.0.1:8080/%%%%u || echo "curl fail %%%%u") && \
	echo "[prod-local] Step 5: header spot-check (CSP / Referrer / Permissions)" && \
	(curl -sI http://127.0.0.1:8080/ | findstr /i "content-security-policy" && \
	 curl -sI http://127.0.0.1:8080/ | findstr /i "referrer-policy" && \
	 curl -sI http://127.0.0.1:8080/ | findstr /i "permissions-policy") || echo "[prod-local] header check issues" && \
	echo "[prod-local] Step 6: /api/metrics alias (expect 307)" && \
	(curl -sI http://127.0.0.1:8080/api/metrics | findstr /i "HTTP/1.1 307" && curl -sI http://127.0.0.1:8080/api/metrics | findstr /i "location:") || echo "[prod-local] metrics alias unexpected" && \
	echo "[prod-local] Done. Use 'make prod-local-down' to stop."

prod-local-down:
	set FILES=-f docker-compose.prod.yml -f docker-compose.prod.override.yml && \
	echo "[prod-local] tearing down stack" && docker compose %FILES% down

# --- Prod DB password alignment & readiness wrappers ---
.PHONY: pw-rotate-prod prod-ready edge-check edge-verify port-guard tunnel-verify tunnel-bootstrap cert-check origin-check bind-hosts verify-hosts

pw-rotate-prod:
	pwsh ./scripts/prod-password-align.ps1 -Generate -Length 32 -UpdateEnvFile

prod-ready:
	pwsh ./scripts/prod-ready.ps1

edge-check:
	@curl -s -o /dev/null -w "UP %{http_code}\n" https://app.ledger-mind.org/_up && \
	 curl -s -o /dev/null -w "READY %{http_code}\n" https://app.ledger-mind.org/ready && \
	 curl -s -o /dev/null -w "HEALTHZ %{http_code}\n" https://app.ledger-mind.org/api/healthz

# Extended edge & LLM verification (JSON with -Json flag optional)
edge-verify:
	pwsh ./scripts/edge-verify.ps1 -IncludeGenerate -VerboseModels

# Detect conflicting stacks binding critical ports (80/443/11434)
port-guard:
	pwsh ./scripts/port-guard.ps1 -FailOnConflict

# Tunnel verification (strict: enforce HA connections & DNS)
tunnel-verify:
	pwsh ./scripts/edge-verify.ps1 -TunnelStrict -MinHaConnections 1 -VerboseModels

# Bootstrap / regenerate cloudflared config stub (does not create credentials)
tunnel-bootstrap:
	pwsh ./scripts/tunnel-bootstrap.ps1

# Certificate expiry + strict tunnel + DNS + HA connections (JSON output to edge-verify.json)
cert-check:
	pwsh ./scripts/edge-verify.ps1 -Json -TunnelStrict -MinHaConnections 1 -CertMinDays 14 > edge-verify.json

# Internal origin connectivity via debugbox (expects debugbox service available in override)
origin-check:
	docker compose -f docker-compose.prod.yml -f docker-compose.prod.override.yml run --rm debugbox sh -lc "apk add --no-cache curl >/dev/null 2>&1 && echo NGINX && curl -s -o /dev/null -w 'UP %{http_code}\n' http://nginx/_up && echo BACKEND && curl -s -o /dev/null -w 'READY %{http_code}\n' http://backend:8000/ready"

# Bind hostnames to active tunnel (requires CLOUDFLARE_API_TOKEN + CLOUDFLARE_ZONE_ID, and powershell cloudflared CLI available locally if using API scripts)
prod-local:
	pwsh ./scripts/cf-bind-hostnames.ps1 -Hostnames @('app.ledger-mind.org','ledger-mind.org','www.ledger-mind.org') -TunnelUUID 6a9e2d7e-9c48-401b-bdfd-ab219d3d4df5 -ZoneId $$env:CLOUDFLARE_ZONE_ID -ApiToken $$env:CLOUDFLARE_API_TOKEN

verify-hosts:
	pwsh ./scripts/cf-hostname-verify.ps1 -Hostnames @('app.ledger-mind.org','ledger-mind.org','www.ledger-mind.org') -TunnelUUID 6a9e2d7e-9c48-401b-bdfd-ab219d3d4df5 -ZoneId $$env:CLOUDFLARE_ZONE_ID -ApiToken $$env:CLOUDFLARE_API_TOKEN > ops/artifacts/cf-hosts.json

# --- Tunnel / edge convenience targets ---
.PHONY: tunnel tunnel-logs tunnel-check prod-down

tunnel:
	docker compose -f docker-compose.prod.yml -f docker-compose.prod.override.yml up -d nginx backend cloudflared

tunnel-logs:
	docker compose -f docker-compose.prod.yml -f docker-compose.prod.override.yml logs --tail=120 cloudflared

tunnel-check:
	@curl -sfI https://app.ledger-mind.org/ready >/dev/null && echo "✅ /ready ok" || echo "❌ /ready"; \
	 curl -sfI https://app.ledger-mind.org/api/healthz >/dev/null && echo "✅ /healthz ok" || echo "❌ /healthz"

# legacy prod-down kept for compatibility (calls new target)
legacy-prod-down:
	$(MAKE) prod-down

# Validate cloudflared credentials / config consistency
.PHONY: cloudflared-validate
cloudflared-validate:
	pwsh -File scripts/validate-cloudflared-config.ps1

.PHONY: fmt lint dev build-web build-edge build-ui check-ui

fmt:
	yapf -ir apps/backend || true
	npx prettier -w apps/web || true

dev:
	uvicorn app.main:app --app-dir apps/backend --reload

# Build only the web image and run its internal build to produce fresh dist assets.
# Uses prod compose files; override file is optional and included if present.
build-web:
	docker compose -f docker-compose.prod.yml build web --no-cache
	# Run web container build step explicitly to ensure dist is generated (if Dockerfile didn't already)
	docker compose -f docker-compose.prod.yml run --rm web true

# Build the edge nginx image that currently bakes in the dist assets.
build-edge:
	docker compose -f docker-compose.prod.yml build nginx --no-cache

# Convenience target to rebuild frontend assets and then the edge image.
build-ui: build-web build-edge

# Quick sanity: list a few asset files (hashes) from the running edge nginx container.
check-ui:
	@echo "[check-ui] Current asset files (tail) from edge nginx:" && \
	docker compose -f docker-compose.prod.yml exec nginx sh -c 'ls -1 /usr/share/nginx/html/assets | tail -n 10' || echo "nginx not running"

# ------------------------------------------------------------------
# Coverage & Diff Utilities
# ------------------------------------------------------------------
.PHONY: test-cov cov-xml cov-diff cov-badge

# Quick terminal coverage (backend app only)
test-cov:
	python -m pytest -q --maxfail=1 --disable-warnings \
	  --cov=apps/backend/app --cov-report=term-missing

# Produce XML (used by diff-cover & badge)
cov-xml:
	python -m pytest -q --maxfail=1 --disable-warnings \
	  --cov=apps/backend/app --cov-report=xml:coverage.xml

# HTML diff vs origin/main (does not fail build hard due to trailing '|| true')
cov-diff: cov-xml
	python -m diff_cover.diff_cover coverage.xml --compare-branch origin/main \
	  --html-report coverage_diff.html --fail-under=90 || true

# Generate SVG badge into docs/badges
cov-badge: cov-xml
	@if not exist docs/badges mkdir docs/badges
	python -m genbadge coverage -i coverage.xml -o docs/badges/coverage.svg

# End-to-end edge sanity: verify internal container health, then external endpoints via Cloudflare tunnel.
.PHONY: edge-sanity
edge-sanity:
	@echo "[edge-sanity] Internal container healthchecks:" && \
	docker compose -f docker-compose.prod.yml ps --status=running && \
	echo "[edge-sanity] Curl nginx /_up inside network:" && \
	docker compose -f docker-compose.prod.yml exec nginx sh -c 'wget -q -O - http://127.0.0.1/_up && echo OK || echo FAIL' && \
	echo "[edge-sanity] External edge checks (Cloudflare tunnel):" && \
	( curl -sfI https://app.ledger-mind.org/_up >/dev/null && echo "✅ edge /_up" || echo "❌ edge /_up" ) && \
	( curl -sfI https://app.ledger-mind.org/ready >/dev/null && echo "✅ edge /ready" || echo "❌ edge /ready" ) && \
	( curl -sfI https://app.ledger-mind.org/api/healthz >/dev/null && echo "✅ edge /api/healthz" || echo "❌ edge /api/healthz" ) && \
	( curl -sfI https://app.ledger-mind.org/agui/ping >/dev/null && echo "✅ edge /agui/ping" || echo "❌ edge /agui/ping" )

# ------------------------------------------------------------------
# Coverage summary & ingest smoke helpers
# ------------------------------------------------------------------
.PHONY: cov-summary ingest-smoke

cov-summary: cov-xml
	@python - <<'PY'
import xml.etree.ElementTree as ET
r=ET.parse('coverage.xml').getroot()
line_rate=float(r.get('line-rate',0))*100
branch_attr=r.get('branch-rate')
if branch_attr is not None:
    br=float(branch_attr)*100
    print(f"Coverage: {line_rate:.2f}% lines, {br:.2f}% branches")
else:
    print(f"Coverage: {line_rate:.2f}% lines")
PY

ingest-smoke:
	pytest -q apps/backend/tests/test_ingest_csv_smoke.py

.PHONY: ingest-smoke-large
ingest-smoke-large:
	INGEST_LARGE=1 pytest -q apps/backend/tests/test_ingest_csv_smoke.py::test_ingest_post_auth_large_optional

# --------------------------------------------------------------
# CSP Verification
# URL can be overridden: make verify-csp URL=http://127.0.0.1/
# --------------------------------------------------------------
.PHONY: verify-csp
URL?=http://127.0.0.1/
verify-csp:
	@sh ./scripts/verify-csp.sh $(URL)

# --------------------------------------------------------------
# Analytics smoke (local prod-like)
# Usage: make analytics-smoke [BASE_URL=http://127.0.0.1]
# --------------------------------------------------------------
.PHONY: analytics-smoke
BASE_URL?=http://127.0.0.1
analytics-smoke:
	pwsh ./scripts/analytics-smoke.ps1 -BaseUrl $(BASE_URL)

.PHONY: csp-check-runtime
## Tail nginx logs to confirm runtime CSP hashing executed and config version injected
csp-check-runtime:
	@echo "[csp-check] Verifying CSP runtime hasher ran..." && \
	 docker compose -f docker-compose.prod.yml logs --tail=120 nginx | findstr /i "[csp]" || echo "[csp-check] No CSP log lines (container may need restart)" && \
	 echo "[csp-check] Header sample:" && \
	 curl -sI http://127.0.0.1/ | findstr /i "content-security-policy" && \
	 curl -sI http://127.0.0.1/ | findstr /i "x-config-version" || true

# ----------------------------
# Web deploy (frontend + nginx)
# ----------------------------

.PHONY: help
## Show common targets
.PHONY: ml-wipe
## Wipe the ML model file (forces retraining on next categorization)
ml-wipe:
	@echo "[ml-wipe] Removing ML model file..."
	@docker compose exec -T backend python -m app.scripts.ml_model_tools wipe

.PHONY: ml-reseed
## Complete ML reset: wipe model + reseed categories/rules
ml-reseed:
	@echo "[ml-reseed] Running complete ML reset workflow..."
	@pwsh -NoProfile -ExecutionPolicy Bypass scripts/ml-reseed.ps1

help:
	@echo "Common targets:"
	@echo "  deploy-web-edge          Build web, rebuild nginx image, bring it up, run smokes"
	@echo "  ml-wipe                  Wipe ML model file (forces retraining)"
	@echo "  ml-reseed                Complete ML reset (wipe + reseed categories/rules)"
	@echo ""
	@echo "E2E Testing:"
	@echo "  e2e                      Run all E2E tests (Postgres + Playwright)"
	@echo "  e2e GREP=\"pattern\"       Run tests matching pattern"
	@echo "  e2e BASELINE=1           Update visual baselines"
	@echo "  e2e DOWN=1               Stop Postgres after tests"
	@echo "  e2e-db-start             Start Postgres only"
	@echo "  e2e-db-stop              Stop Postgres"
	@echo "  e2e-db-reset             Reset database only"
	@echo ""
	@echo "Examples:"
	@echo "  make e2e GREP=\"tooltip visual baseline\" BASELINE=1 DOWN=1"
	@echo "  make e2e-db-start"
	@echo "  make e2e-run GREP=\"login\""
	@echo ""
	@echo "  help                     Show this help"

.PHONY: check-tools
## Verify required CLI tools are available
check-tools:
	@pwsh -NoProfile -Command "$$ErrorActionPreference='Stop'; \
	  if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) { Write-Error 'pnpm not found in PATH'; exit 1 } ; \
	  if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { Write-Error 'docker not found in PATH'; exit 1 } ; \
	  Write-Host 'Tools OK'"

.PHONY: deploy-web-edge
## One-shot frontend rebuild + edge nginx refresh + smokes
# Usage:
#   make deploy-web-edge
# Pass-thru flags to PowerShell (optional):
#   make deploy-web-edge FLAGS="--SkipCspHash --NoAnalyticsEvent"
deploy-web-edge: check-tools
	@echo "[deploy-web-edge] Running web deploy pipeline"
	@pwsh -NoProfile -ExecutionPolicy Bypass scripts/deploy-web.ps1 $(FLAGS)

# How to use
# Default full pipeline (web build → nginx build → up → smokes)
#   make deploy-web-edge
# Pass optional flags to your PowerShell script (if you add any later)
#   make deploy-web-edge FLAGS="--SkipCspHash --NoAnalyticsEvent"

# ------------------------------------------------------------------
# E2E Testing with Playwright + Postgres
# ------------------------------------------------------------------
.PHONY: e2e e2e-db-up e2e-migrate-reset-seed e2e-web e2e-run e2e-down e2e-db-start e2e-db-stop e2e-db-reset

## Full E2E workflow: start Postgres → migrate → reset → seed → run tests
## Usage:
##   make e2e                                          # Run all E2E tests
##   make e2e GREP="tooltip visual baseline"          # Run specific tests
##   make e2e BASELINE=1                               # Update snapshots
##   make e2e GREP="tooltip visual baseline" BASELINE=1 DOWN=1  # Full workflow + cleanup
GREP ?=
BASELINE ?= 0
DOWN ?= 0

e2e: e2e-db-up e2e-migrate-reset-seed e2e-web e2e-run
	@if [ "$(DOWN)" = "1" ]; then $(MAKE) e2e-down; fi
	@echo "✅ E2E completed"

## Start Postgres E2E database (docker compose)
e2e-db-up:
	@echo "🗄️  Starting Postgres E2E database..."
	@docker compose -f docker-compose.e2e.yml up -d db
	@echo "⏳ Waiting for Postgres to be healthy..."
	@for i in $$(seq 1 60); do \
	  docker compose -f docker-compose.e2e.yml exec -T db pg_isready -U app -d app_e2e >/dev/null 2>&1 && { echo "✅ Postgres is healthy"; break; } || sleep 2; \
	done

## Migrate, reset, and seed the E2E database
e2e-migrate-reset-seed:
	@echo "🧱 Migrating + resetting + seeding..."
	@cd apps/backend && \
	  echo "  📦 Installing backend dependencies..." && \
	  python -m pip install -r requirements.txt -q && \
	  echo "  🔄 Running migrations..." && \
	  python -m alembic upgrade head && \
	  echo "  🗑️  Resetting database..." && \
	  python scripts/e2e_db_reset.py && \
	  echo "  🌱 Seeding test user..." && \
	  python -m app.cli_seed_dev_user $${DEV_E2E_EMAIL:-leoklemet.pa@gmail.com} $${DEV_E2E_PASSWORD:-Superleo3}
	@echo "✅ Backend setup complete"

## Install web dependencies and Playwright browsers
e2e-web:
	@echo "📦 Installing web deps + browsers..."
	@cd apps/web && \
	  pnpm i && \
	  pnpm exec playwright install --with-deps chromium

## Run Playwright E2E tests
e2e-run:
	@echo "🎭 Running Playwright E2E tests..."
	@cd apps/web && \
	  ARGS=""; \
	  [ -n "$(GREP)" ] && ARGS="$$ARGS -g \"$(GREP)\"" && echo "🔍 Running tests matching: $(GREP)"; \
	  [ "$(BASELINE)" = "1" ] && ARGS="$$ARGS --update-snapshots" && echo "📸 Updating snapshots (baseline mode)"; \
	  eval pnpm exec playwright test $$ARGS

## Stop Postgres E2E database (includes volume cleanup)
e2e-down:
	@echo "🧹 Stopping Postgres E2E database..."
	@docker compose -f docker-compose.e2e.yml down -v

## Individual convenience targets
e2e-db-start: e2e-db-up
	@echo "✅ Database is ready"

e2e-db-stop:
	@echo "🛑 Stopping Postgres..."
	@docker compose -f docker-compose.e2e.yml down -v

e2e-db-reset:
	@echo "🗑️  Resetting E2E database..."
	@cd apps/backend && python scripts/e2e_db_reset.py
	@echo "✅ Database reset complete"
