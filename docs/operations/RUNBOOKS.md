# Runbooks & Playbooks

Operational procedures for common LedgerMind scenarios.

---

## Deployment

**Scenario:** Deploy new backend/frontend version to production

**Steps:**
1. Get commit SHA: `git rev-parse --short=8 HEAD`
2. Build images: `docker build -t ledgermind-backend:main-$SHA apps/backend`
3. Update `docker-compose.prod.yml` with new image tags
4. Deploy: `docker compose -f docker-compose.prod.yml up -d`
5. Verify: `curl https://app.ledger-mind.org/api/ready`

**See:** [`../setup/PRODUCTION_SETUP.md`](../setup/PRODUCTION_SETUP.md)

---

## Database Migration

**Scenario:** Apply new Alembic migration in production

**Steps:**
1. Backup database: `pg_dump -U prod_user ledgermind > backup.sql`
2. Apply migration: `docker exec BACKEND_CONTAINER alembic upgrade head`
3. Verify: `docker exec BACKEND_CONTAINER alembic current`
4. If failed, rollback: `docker exec BACKEND_CONTAINER alembic downgrade -1`

---

## KEK Rotation

**Scenario:** Rotate KMS key encryption key

**Steps:**
1. Backup `encryption_keys` table
2. Generate new KEK in GCP KMS
3. Run: `python -m app.cli kek-rewrap-gcp`
4. Update `.env` with new `GCP_KMS_KEY`
5. Restart backend

---

## Incident Response

**Scenario:** Production outage

**Steps:**
1. Check health: `curl https://app.ledger-mind.org/api/healthz`
2. Check logs: `docker compose logs backend --tail=100`
3. Check Cloudflare Tunnel: `docker compose logs cloudflared`
4. If DB issue, check: `docker compose logs postgres`
5. Rollback if needed (see Deployment)

---

## Performance Degradation

**Scenario:** Slow response times

**Steps:**
1. Check metrics: `/api/metrics`
2. Check DB connections: `SELECT count(*) FROM pg_stat_activity;`
3. Check LLM latency: `curl localhost:11434/v1/chat/completions`
4. Restart backend if necessary: `docker compose restart backend`

---

## Further Reading

- **Troubleshooting:** [`TROUBLESHOOTING.md`](TROUBLESHOOTING.md)
- **Monitoring:** [`MONITORING.md`](MONITORING.md)
