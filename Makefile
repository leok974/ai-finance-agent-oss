## ------------------------------------------------------------------
## Convenience targets for dev vs prod stack
## ------------------------------------------------------------------
.PHONY: dev prod stop

dev:
	docker compose -f docker-compose.dev.yml up -d web backend postgres

prod:
	docker compose -f docker-compose.yml -f docker-compose.prod.override.yml up -d

# Rebuild prod images (backend, web, nginx, agui) with cache bust + pull then bring stack up
.PHONY: rebuild-prod
rebuild-prod:
	pwsh ./scripts/rebuild-prod.ps1 -Pull -NoCache

stop:
	docker compose down || true

# --- Tunnel / edge convenience targets ---
.PHONY: tunnel tunnel-logs tunnel-check prod-down

tunnel:
	docker compose -f docker-compose.prod.yml -f docker-compose.prod.override.yml up -d nginx backend cloudflared

tunnel-logs:
	docker compose -f docker-compose.prod.yml -f docker-compose.prod.override.yml logs --tail=120 cloudflared

tunnel-check:
	@curl -sfI https://app.ledger-mind.org/ready >/dev/null && echo "✅ /ready ok" || echo "❌ /ready"; \
	 curl -sfI https://app.ledger-mind.org/api/healthz >/dev/null && echo "✅ /healthz ok" || echo "❌ /healthz"

prod-down:
	docker compose down

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
