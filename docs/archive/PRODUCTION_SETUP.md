# Production Deployment

Complete guide for deploying LedgerMind to production.

---

## Overview

LedgerMind production stack uses:
- **Docker Compose** for orchestration
- **Nginx** as reverse proxy (port 8083)
- **Cloudflare Tunnel** for secure ingress
- **PostgreSQL** for persistence
- **KMS** for encryption key management

**Live instance:** [https://app.ledger-mind.org](https://app.ledger-mind.org)

---

## Prerequisites

- Docker Engine (Linux host recommended)
- Git
- GCP KMS key (or env-based KEK for testing)
- Cloudflare account with Tunnel configured
- Domain with DNS pointed to Cloudflare

---

## Quick Deployment

### 1. Clone & Configure

```bash
git clone https://github.com/leok974/ai-finance-agent-oss.git
cd ai-finance-agent-oss

# Copy environment template
cp .env.example .env
```

### 2. Edit `.env` (Production)

```bash
# Environment
APP_ENV=prod
DEBUG=0

# Database
DATABASE_URL=postgresql+psycopg://prod_user:STRONG_PASSWORD@postgres:5432/ledgermind

# Encryption (GCP KMS)
ENCRYPTION_ENABLED=1
GCP_KMS_KEY=projects/PROJECT_ID/locations/global/keyRings/RING/cryptoKeys/KEY
GCP_KMS_AAD=app=ledgermind,env=prod
GOOGLE_APPLICATION_CREDENTIALS=/secrets/gcp-sa.json

# LLM
MODEL=gpt-oss:20b
OPENAI_BASE_URL=http://ollama:11434/v1  # Or remote endpoint
OPENAI_API_KEY_FILE=/run/secrets/openai_api_key  # Docker secret

# Cloudflare Tunnel
CLOUDFLARE_TUNNEL_TOKEN=<your-tunnel-token>
```

### 3. Prepare Secrets

```bash
# GCP Service Account
mkdir -p secrets/gcp-sa.json
cp /path/to/sa-key.json secrets/gcp-sa.json/ledgermind-backend-sa.json

# OpenAI API Key (Docker secret)
echo "sk-your-key-here" > secrets/openai_api_key
```

### 4. Build Images

```bash
# Get current commit hash
$SHORT_SHA = git rev-parse --short=8 HEAD

# Build backend
cd apps/backend
docker build -t "ledgermind-backend:main-$SHORT_SHA" .

# Build frontend
cd ../web
docker build -t "ledgermind-web:main-$SHORT_SHA" .
cd ../..
```

### 5. Update Compose File

Edit `docker-compose.prod.yml`:

```yaml
services:
  backend:
    image: ledgermind-backend:main-abc12345  # Update with $SHORT_SHA
    pull_policy: never

  nginx:
    image: ledgermind-web:main-abc12345  # Update with $SHORT_SHA
    pull_policy: never
```

### 6. Deploy

```bash
# Start stack
docker compose -f docker-compose.prod.yml up -d

# Run migrations
docker exec $(docker ps -q -f name=backend) alembic upgrade head

# Verify health
curl -s http://localhost:8083/api/ready | jq
```

Expected response:
```json
{
  "ok": true,
  "db": {"ok": true},
  "migrations": {"ok": true, "current": "abc123", "head": "abc123"},
  "crypto": {"ok": true},
  "llm": {"ok": true}
}
```

---

## Deployment Scripts

### PowerShell (Windows)

```powershell
# Full deployment
.\scripts\prod-bootstrap.ps1 -Full -ReadyTimeoutSec 120

# With PostgreSQL reset
.\scripts\prod-bootstrap.ps1 -ResetPg -Full

# JSON output for CI
.\scripts\prod-bootstrap.ps1 -Full -Json
```

### Bash (Linux)

```bash
# Full deployment
./scripts/prod-bootstrap.sh -Full -ReadyTimeoutSec 120

# With auto-migration on drift
./scripts/prod-bootstrap.sh -Full -AutoMigrate
```

---

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Deploy Production

on:
  push:
    branches: [main]
    tags: ['v*']

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Build images
        run: |
          SHORT_SHA=$(git rev-parse --short=8 HEAD)
          docker build -t ledgermind-backend:main-$SHORT_SHA apps/backend
          docker build -t ledgermind-web:main-$SHORT_SHA apps/web

      - name: Deploy to production
        run: |
          # SSH to production host and update docker-compose.prod.yml
          # Then: docker compose up -d

      - name: Verify deployment
        run: |
          curl -sf https://app.ledger-mind.org/api/ready || exit 1
```

---

## Cloudflare Tunnel Setup

### 1. Install cloudflared

```bash
# Linux
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared
chmod +x /usr/local/bin/cloudflared

# Windows
# Download from https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation
```

### 2. Authenticate

```bash
cloudflared tunnel login
```

### 3. Create Tunnel

```bash
cloudflared tunnel create ledgermind-prod
# Outputs: <UUID>.json credential file
```

### 4. Configure Tunnel

Create `cloudflared/config.yml`:

```yaml
tunnel: <TUNNEL_UUID>
credentials-file: /etc/cloudflared/<TUNNEL_UUID>.json

ingress:
  - hostname: app.ledger-mind.org
    service: http://nginx:80
  - hostname: www.ledger-mind.org
    service: http://nginx:80
  - service: http_status:404
```

### 5. Route DNS

```bash
cloudflared tunnel route dns ledgermind-prod app.ledger-mind.org
cloudflared tunnel route dns ledgermind-prod www.ledger-mind.org
```

### 6. Start Tunnel

```bash
# Via Docker Compose (already configured)
docker compose -f docker-compose.prod.yml up -d cloudflared

# Verify
docker compose logs cloudflared
```

---

## Database Backups

### Manual Backup

```bash
# Create backup
docker exec $(docker ps -q -f name=postgres) pg_dump -U prod_user -d ledgermind \
  > backup_$(date +%Y%m%d_%H%M%S).sql

# Restore
docker exec -i $(docker ps -q -f name=postgres) psql -U prod_user -d ledgermind \
  < backup_20251125_120000.sql
```

### Automated Backups (Cron)

```bash
# /etc/cron.daily/ledgermind-backup
#!/bin/bash
BACKUP_DIR=/var/backups/ledgermind
mkdir -p $BACKUP_DIR

docker exec $(docker ps -q -f name=postgres) pg_dump -U prod_user -d ledgermind \
  | gzip > $BACKUP_DIR/ledgermind_$(date +%Y%m%d).sql.gz

# Keep only last 30 days
find $BACKUP_DIR -name "*.sql.gz" -mtime +30 -delete
```

---

## Monitoring

### Health Checks

```bash
# Basic health
curl https://app.ledger-mind.org/api/ready

# Detailed health
curl https://app.ledger-mind.org/api/healthz | jq

# Tunnel metrics
curl http://localhost:2000/metrics  # Cloudflared metrics
```

### Prometheus Integration

See [`../operations/MONITORING.md`](../operations/MONITORING.md) for Prometheus/Grafana setup.

---

## Security Hardening

### 1. Secrets Management

- **Never commit secrets to git**
- Use Docker secrets for sensitive files
- Rotate secrets regularly (quarterly recommended)

### 2. Firewall Rules

```bash
# Allow only SSH and Cloudflare Tunnel
ufw allow 22/tcp
ufw allow from <cloudflare-ip-ranges>
ufw enable
```

### 3. SSL/TLS

Cloudflare provides SSL termination. For origin certificates:

```bash
# Let's Encrypt (if not using Cloudflare)
docker compose -f docker-compose.prod.yml up -d certbot
```

---

## Rollback Procedure

### 1. Identify Last Good Commit

```bash
git log --oneline -10
```

### 2. Rebuild Images

```bash
git checkout <good-commit>
SHORT_SHA=$(git rev-parse --short=8 HEAD)

docker build -t ledgermind-backend:main-$SHORT_SHA apps/backend
docker build -t ledgermind-web:main-$SHORT_SHA apps/web
```

### 3. Update Compose & Deploy

```bash
# Edit docker-compose.prod.yml with rollback images
docker compose -f docker-compose.prod.yml up -d
```

### 4. Verify

```bash
curl https://app.ledger-mind.org/api/ready
```

---

## Troubleshooting

### Backend Won't Start

**Check logs:**
```bash
docker compose logs backend --tail=100
```

**Common issues:**
- `crypto_ready: false` → Verify GCP SA JSON is mounted
- `db connection failed` → Check DATABASE_URL and Postgres health
- `migrations out of sync` → Run `alembic upgrade head`

### Cloudflare Tunnel Down

**Check status:**
```bash
docker compose logs cloudflared --tail=50
```

**Common issues:**
- `credentials not found` → Verify `<UUID>.json` filename matches `config.yml`
- `connection refused` → Ensure nginx is running on port 80
- `DNS not resolving` → Verify DNS routes in Cloudflare dashboard

### High Memory Usage

**Check container stats:**
```bash
docker stats
```

**Mitigation:**
```bash
# Restart services
docker compose restart backend nginx

# Prune unused resources
docker system prune -a
```

---

## Scaling Considerations

### Horizontal Scaling

For high traffic, consider:
1. Multiple backend instances behind load balancer
2. Read replicas for PostgreSQL
3. Redis for session/cache storage
4. Separate LLM inference service

### Resource Limits

Edit `docker-compose.prod.yml`:

```yaml
services:
  backend:
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 4G
        reservations:
          cpus: '1'
          memory: 2G
```

---

## Next Steps

- **Monitoring setup:** See [`../operations/MONITORING.md`](../operations/MONITORING.md)
- **Incident runbooks:** See [`../operations/RUNBOOKS.md`](../operations/RUNBOOKS.md)
- **Security hardening:** See [`../architecture/SECURITY.md`](../architecture/SECURITY.md)
