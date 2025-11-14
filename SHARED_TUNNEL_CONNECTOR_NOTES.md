# Shared Cloudflare Tunnel Connector Guardrails

**Location**: The shared tunnel connectors (`cfd-a`, `cfd-b`) are managed in a separate docker-compose file (outside this repository).

## Required Configuration

When managing the shared tunnel connectors, add these guardrails to their compose file:

```yaml
# -----------------------------------------------------------------------------------
# SHARED CLOUDFLARE NAMED TUNNEL CONNECTORS (cfd-a / cfd-b)
#
# - This is the ONLY tunnel used for:
#     - applylens.app
#     - siteagents.app
#     - leoklemet.com (portfolio)
#     - ledger-mind.org (LedgerMind web + API)
#
# RULES:
# - DO NOT add a separate cloudflared container for LedgerMind.
# - DO NOT override --config with a local config.yml containing ingress rules.
#   The ingress is managed in the Cloudflare dashboard only.
# - DO NOT change the tunnel name/uuid without also updating:
#     - Cloudflare Zero Trust -> Tunnels (all hostnames)
#     - CNAMEs in each DNS zone.
#
# - These containers MUST be on `infra_net` so they can reach:
#     - ledgermind-web.int:80
#     - ledgermind-api.int:8000
#     - siteagent-ui.int:80
#     - siteagent-api.int:8000
#     - applylens-web:80
#     - applylens-api:8003
#     - portfolio.int:80
#     - devdiag-http:8080
# -----------------------------------------------------------------------------------
services:
  cfd-a:
    image: cloudflare/cloudflared:latest
    command: tunnel --no-autoupdate run <tunnel-name-or-uuid>
    restart: unless-stopped
    networks:
      infra_net:
        aliases:
          - cfd-a

  cfd-b:
    image: cloudflare/cloudflared:latest
    command: tunnel --no-autoupdate run <tunnel-name-or-uuid>
    restart: unless-stopped
    networks:
      infra_net:
        aliases:
          - cfd-b

networks:
  infra_net:
    external: true
```

## Tunnel Configuration (Cloudflare Dashboard)

**Tunnel ID**: `08d5feee-f504-47a2-a1f2-b86564900991` (applylens shared tunnel)

**Dashboard Routes** (Zero Trust → Networks → Tunnels):

| Hostname | Service | Notes |
|----------|---------|-------|
| `app.ledger-mind.org` | `http://ledgermind-web.int:80` | LedgerMind frontend (nginx) |
| `api.ledger-mind.org` | `http://ledgermind-api.int:8000` | LedgerMind API (backend) |
| `applylens.app` | `http://applylens-web:80` | ApplyLens frontend |
| `api.applylens.app` | `http://applylens-api:8003` | ApplyLens API |
| `siteagents.app` | `http://siteagent-ui.int:80` | SiteAgents frontend |
| `www.siteagents.app` | `http://siteagent-ui.int:80` | SiteAgents www redirect |
| `api.siteagents.app` | `http://siteagent-api.int:8000` | SiteAgents API |
| `agent.siteagents.app` | `http://siteagent-api.int:8000` | SiteAgents agent endpoint |
| `leoklemet.com` | `http://portfolio.int:80` | Portfolio site |
| `www.leoklemet.com` | `http://portfolio.int:80` | Portfolio www redirect |
| `api.leoklemet.com` | `http://portfolio-api.int:8000` | Portfolio API |
| `devdiag.leoklemet.com` | `http://devdiag-http:8080` | DevDiag diagnostics |

**IMPORTANT**:
- All routes managed via Cloudflare Dashboard (config version managed remotely)
- No local `config.yml` with ingress rules (dashboard overrides local config)
- All services use HTTP internally (TLS terminated at Cloudflare edge)
- No `httpHostHeader` overrides needed

## Health Check

Run this from the LedgerMind repository root:

```powershell
pwsh scripts/lm-health.ps1
```

Expected output:
- Internal checks: HTTP 200 OK for both nginx and backend
- External checks:
  - `https://app.ledger-mind.org/` → HTTP 200 OK
  - `https://api.ledger-mind.org/ready` → HTTP 200 OK
  - `https://app.ledger-mind.org/api/auth/me` → HTTP 401 Unauthorized (correct - no credentials)
