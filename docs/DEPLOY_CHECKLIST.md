# Deployment Checklist

> Fast, auditable list of pre & post deployment actions for LedgerMind (AI Finance Agent).

Cross-links: [README](../README.md) · [VERIFY_PROD](VERIFY_PROD.md) · [SMOKE_TESTS](SMOKE_TESTS.md) · [TROUBLESHOOTING_CLOUDFLARE_TUNNEL](TROUBLESHOOTING_CLOUDFLARE_TUNNEL.md) · [CRYPTO_SETUP](CRYPTO_SETUP.md) · [LLM_SETUP](LLM_SETUP.md)

---
## 1. Pre-Deploy
| Step | Action | Command / Detail | ✅ Criteria |
|------|--------|------------------|-------------|
| 1 | Secrets ignored | Confirm `.gitignore` excludes `secrets/` & `*.gcp-sa.json` | No secret files in `git status` |
| 2 | Service account present | Place `secrets/gcp-sa.json/ledgermind-backend-sa.json` | File exists locally |
| 3 | Env file ready | Populate `.env` or compose overrides with required vars | Contains KMS & model vars |
| 4 | Crypto roles | SA has `roles/cloudkms.cryptoKeyEncrypterDecrypter` | `crypto-status` works locally |
| 5 | Tunnel origin normalized | Inspect `cloudflared/config.yml` | Shows `http://nginx:80` |
| 6 | Build images (optional CI) | `docker compose build` (or CI pipeline) | Build succeeds |
| 7 | Run smoke tests (local) | `./scripts/smoke.sh` or `./scripts/smoke.ps1` | All ✅ |
| 8 | Confirm model availability | `curl /agent/models` | ≥1 model or documented fallback plan |
| 9 | LLM warm (Ollama) | `ollama pull gpt-oss:20b` (if cold) | Image cached |
| 10 | Version note | Record git commit SHA for release notes | SHA logged |

## 2. Deploy
```
docker compose -f docker-compose.prod.yml -f docker-compose.prod.override.yml up -d
```
Check container list for expected services: backend, web, nginx, cloudflared, ollama (if local), postgres.

## 3. Post-Deploy (External)
| Step | Check | Command | ✅ Criteria |
|------|-------|---------|------------|
| A | Readiness | `curl -fsS https://app.ledger-mind.org/ready` | JSON with `"ok":true` & `"crypto_ready":true` (prod) |
| B | Healthz | `curl -fsS https://app.ledger-mind.org/api/healthz` | 200 OK |
| C | Models | `curl -fsS https://app.ledger-mind.org/agent/models` | Non-empty (unless fallback intentionally absent) |
| D | LLM Health | `curl -fsS https://app.ledger-mind.org/llm/health` | 200 & provider status fields |
| E | UI Load | Visit app in browser | SPA renders, no 502s |

## 4. Post-Deploy (Internal / Network Namespace)
| Step | Check | Command | ✅ Criteria |
|------|-------|---------|------------|
| 1 | Backend via nginx | `docker compose exec nginx curl -s -o /dev/null -w '%{http_code}' http://backend:8000/ready` | 200 |
| 2 | Crypto mode | `docker compose exec backend python -m app.cli crypto-status` | `mode":"kms"` |
| 3 | Tunnel logs | `docker compose logs --tail=80 cloudflared` | No new origin 502 lines |
| 4 | Nginx access parity | Compare external vs internal codes | All 200 |

## 5. Optional Security / Hardening Review
| Area | Quick Check | Goal |
|------|-------------|------|
| TLS Termination | Cloudflare edge provides TLS | nginx runs plain HTTP internally |
| Headers | Inspect response headers | Security headers present (add CSP later) |
| Secrets scope | `docker inspect backend` | No extraneous env secrets |

## 6. Rollback Plan (Keep Handy)
| Scenario | Action |
|----------|--------|
| Bad image deploy | `docker compose pull previous && docker compose up -d` with explicit tag |
| Tunnel misconfig | Restore prior `cloudflared/config.yml` from git and recreate container |
| KMS outage | Temporarily set `ENCRYPTION_ENABLED=0` (ack risk) and redeploy (last resort) |

## 7. Logging & Evidence Archive
Capture the following after successful deploy (store in release ticket):
- `git rev-parse HEAD`
- Output of `/ready` & `/api/healthz`
- First 30 lines of `cloudflared` logs
- `crypto-status` output
- Model list snapshot (`/agent/models`)

## 8. Automation Hooks (Future)
| Idea | Benefit |
|------|---------|
| GitHub Action invoking smoke scripts | Early failure detection |
| JSON smoke output + artifact upload | Machine-readable health snapshot |
| Slack webhook notification | Real-time deploy confirmation |

## 9. Cross References
For detailed procedures see: [VERIFY_PROD](VERIFY_PROD.md) · [SMOKE_TESTS](SMOKE_TESTS.md) · [CRYPTO_SETUP](CRYPTO_SETUP.md) · [LLM_SETUP](LLM_SETUP.md) · [TROUBLESHOOTING_CLOUDFLARE_TUNNEL](TROUBLESHOOTING_CLOUDFLARE_TUNNEL.md)

---
Keep this list updated whenever a new critical surface or secret is introduced.
