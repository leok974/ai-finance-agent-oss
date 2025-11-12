# Production Release Checklist

Pre-deployment validation checklist for LedgerMind production releases.

## 1. CI/CD Verification

### GitHub Actions Status
- [ ] All workflow runs passing on `main` branch
- [ ] E2E Fast Lane tests passing (last 3 commits)
- [ ] E2E LLM Lane tests passing (last nightly run)
- [ ] Backend hermetic tests passing
- [ ] Web unit tests passing with coverage >80%

### Secrets Configuration
- [ ] GitHub secrets configured: `E2E_USER`, `E2E_SESSION_HMAC_SECRET`
- [ ] Cloudflare secrets configured: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ZONE_ID`
- [ ] Production secrets updated: `OPENAI_API_KEY_FILE`, `GCP_KMS_KEY`

## 2. Health Endpoints

### Backend Status
Run: `curl -s https://app.ledger-mind.org/agent/status | jq`

Expected response:
```json
{
  "ok": true,
  "llm_ok": true,
  "crypto_ok": true,
  "db_ok": true,
  "migrations_ok": true
}
```

- [ ] `/agent/status` returns `llm_ok: true`
- [ ] `/agent/status` returns `crypto_ok: true`
- [ ] `/agent/status` returns `db_ok: true`
- [ ] `/agent/status` returns `migrations_ok: true`
- [ ] `/ready` returns HTTP 200
- [ ] `/healthz` returns HTTP 200

### Redis Connectivity
Run: `curl -s https://app.ledger-mind.org/admin/redis/ping`

- [ ] Redis responds with `PONG`
- [ ] `REDIS_REPLAY_TTL=300` environment variable set

## 3. Metrics & Monitoring

### Prometheus Metrics
Visit: `https://app.ledger-mind.org/metrics`

- [ ] Metrics endpoint returns `Content-Type: text/plain`
- [ ] `agent_chat_requests_total` metric visible
- [ ] `agent_chat_empty_replies_total` metric visible
- [ ] `agent_auth_hmac_failures_total` metric visible
- [ ] `agent_auth_replay_attempts_total` metric visible

### Recording Rules
Check Prometheus rules are loaded:
```bash
curl -s http://prometheus:9090/api/v1/rules | jq '.data.groups[] | select(.name=="agent_chat_recordings")'
```

- [ ] Recording rule `job:agent_chat_req_rate:5m` loaded
- [ ] Recording rule `job:agent_chat_empty_reply_rate:5m` loaded
- [ ] Recording rule `job:agent_chat_auth_fail_rate:5m` loaded
- [ ] Recording rule `job:agent_chat_replay_rate:5m` loaded
- [ ] Recording rule `job:agent_auth_skew_p95:5m` loaded

### Alert Rules
Check Prometheus alerts are configured:
```bash
curl -s http://prometheus:9090/api/v1/rules | jq '.data.groups[] | select(.name=="agent_chat")'
```

- [ ] Alert `AgentChatEmptyReplySpike` configured
- [ ] Alert `AgentChatAuthFailureHigh` configured
- [ ] Alert `AgentChatReplayAttackDetected` configured
- [ ] Alert `AgentChatClockSkewHigh` configured
- [ ] Alert `AgentChatNoRequests` configured

### Grafana Dashboards
- [ ] Agent Chat dashboard visible with non-zero data
- [ ] HMAC auth metrics panel showing recent activity
- [ ] Redis replay detection panel operational

## 4. LLM Verification

### Manual Health Check
Run: `.\scripts\llm-health.ps1` (Windows) or `bash scripts/llm-health.sh` (Linux)

- [ ] Health check exits with code 0
- [ ] LLM warmup requests succeed (2 requests)
- [ ] `/agent/status` endpoint confirms `llm_ok: true`

### Chat Endpoint Smoke
```bash
curl -X POST https://app.ledger-mind.org/agent/chat \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"test"}],"force_llm":false}'
```

- [ ] Stub mode returns non-empty reply
- [ ] Echo mode preserves message content
- [ ] LLM mode returns coherent response (when `force_llm: true`)

## 5. HMAC Authentication

### Smoke Script Validation
Run: `bash scripts/smoke-hmac.sh`

- [ ] Stub mode test passes
- [ ] Echo mode test passes
- [ ] API path compatibility test passes

### Replay Protection
- [ ] Redis TTL configured (300 seconds)
- [ ] Replay attempt metric `agent_auth_replay_attempts_total` at 0
- [ ] HMAC signature validation working

## 6. Edge & Routing

### Nginx Configuration
- [ ] `/agent/*` paths route correctly
- [ ] `/api/agent/*` compatibility paths work (legacy support)
- [ ] HMAC headers passed through (`X-Client-Id`, `X-Timestamp`, `X-Signature`)
- [ ] CSP headers present and valid

### Cloudflare Tunnel
- [ ] Tunnel status healthy (HA connections ≥ 1)
- [ ] DNS resolution working (`app.ledger-mind.org`)
- [ ] TLS certificate valid (≥ 14 days remaining)

## 7. Database

### Migrations
Run inside backend container:
```bash
docker exec -it <backend_container> alembic current
docker exec -it <backend_container> alembic heads
```

- [ ] Current revision matches head revision
- [ ] No pending migrations

### Connectivity
```bash
docker exec -it <postgres_container> psql -U myuser -d finance -c "SELECT 1;"
```

- [ ] Postgres connection successful
- [ ] Database accessible from backend

## 8. Smoke Tests

### Local Smoke Scripts
Run all smoke tests:
```powershell
# Backend smoke
.\apps\backend\app\scripts\smoke-backend.ps1

# Edge smoke
.\scripts\smoke-edge.ps1

# HMAC smoke
bash scripts/smoke-hmac.sh
```

- [ ] All smoke tests pass
- [ ] No authentication errors
- [ ] Response times within acceptable range (<2s for non-LLM)

## 9. E2E Test Execution

### Critical Path Tests
```bash
cd apps/web
BASE_URL=https://app.ledger-mind.org pnpm exec playwright test --grep "@prod-critical"
```

- [ ] Auth flow tests pass
- [ ] Dashboard rendering tests pass
- [ ] CSV upload tests pass

### LLM Tests (Optional Pre-Release)
```bash
BASE_URL=https://app.ledger-mind.org pnpm exec playwright test --grep "@requires-llm" --workers=1
```

- [ ] Chat functionality tests pass
- [ ] Agent tool tests pass
- [ ] Transaction explanation tests pass

## 10. Deployment Artifacts

### Build Verification
- [ ] Backend Docker image built successfully
- [ ] Web bundle built and deployed to nginx
- [ ] CSP hashes computed correctly
- [ ] Asset fingerprinting working (immutable cache headers)

### Version Tracking
- [ ] Git tag created for release (e.g., `v1.2.3`)
- [ ] CHANGELOG.md updated with release notes
- [ ] Commit SHA documented in deployment logs

## 11. Post-Deployment

### Immediate Verification (First 5 Minutes)
- [ ] `/ready` endpoint returns 200
- [ ] No error spikes in logs
- [ ] Metrics showing traffic
- [ ] No alert firing in Prometheus

### Monitoring (First Hour)
- [ ] `agent_chat_requests_total` incrementing
- [ ] Empty reply rate <1%
- [ ] Auth failure rate <0.1 rps
- [ ] No replay attack attempts
- [ ] p95 clock skew <10s

### Rollback Plan
If critical issues detected:
```bash
# Revert to previous backend image
docker tag ledgermind-backend:previous ledgermind-backend:latest
docker-compose -f docker-compose.prod.yml up -d backend

# Or full stack rollback
git checkout <previous-commit>
docker-compose -f docker-compose.prod.yml up -d --build
```

- [ ] Rollback procedure documented
- [ ] Previous image tagged and available
- [ ] Database backup taken before deployment

## 12. Documentation Updates

- [ ] README.md reflects current deployment state
- [ ] Architecture diagrams updated if needed
- [ ] Runbook links verified and working
- [ ] API documentation current

## Sign-Off

**Release Manager:** ___________________
**Date:** ___________________
**Deployment Time:** ___________________
**Git Commit SHA:** ___________________
**Docker Image Tags:**
- Backend: ___________________
- Nginx: ___________________

**Post-Deployment Verification:**
- [ ] All critical checks passed
- [ ] Monitoring confirmed healthy for 1 hour
- [ ] No rollback required
- [ ] Deployment considered successful

**Notes:**
_Use this space to document any deployment issues, workarounds, or observations._

---

## Appendix: Quick Command Reference

```bash
# Health check
curl -s https://app.ledger-mind.org/agent/status | jq

# Redis ping
curl -s https://app.ledger-mind.org/admin/redis/ping

# Metrics
curl -s https://app.ledger-mind.org/metrics | grep agent_chat

# LLM health
.\scripts\llm-health.ps1  # Windows
bash scripts/llm-health.sh  # Linux

# HMAC smoke
bash scripts/smoke-hmac.sh

# E2E critical
cd apps/web && BASE_URL=https://app.ledger-mind.org pnpm exec playwright test --grep "@prod-critical"

# E2E LLM (nightly)
cd apps/web && BASE_URL=https://app.ledger-mind.org pnpm exec playwright test --grep "@requires-llm" --workers=1
```
