# Docker Network Aliases

## Overview

Stable DNS aliases have been configured on the `infra_net` network to prevent container name flipping (e.g., `nginx-1` → `nginx-2`) after restarts or rebuilds.

## Configured Aliases

| Service | Container Name | Stable Aliases | IP Address |
|---------|----------------|----------------|------------|
| Nginx | `ai-finance-nginx-1` | `ai-finance.int` | 172.23.0.7 |
| Backend | `ai-finance-backend-1` | `ai-finance-api.int`<br>`api.ai-finance.int` | 172.23.0.4 |
| Postgres | `ai-finance-postgres-1` | `ai-finance-db.int` | 172.23.0.2 |

## Benefits

✅ **Stable DNS names** across container restarts
✅ **No more `-2`, `-3` suffixes** after rebuilds
✅ **Cloudflare tunnel** can reference stable names
✅ **Predictable service discovery** for other containers

## Usage Examples

### Cloudflare Tunnel Configuration
```yaml
ingress:
  - hostname: ledger-mind.org
    service: http://ai-finance.int:80
  - hostname: app.ledger-mind.org
    service: http://ai-finance.int:80
```

### Database Connection
```bash
postgresql://myuser:password@ai-finance-db.int:5432/finance
```

### Backend API Access (from other containers)
```bash
# Both aliases work
curl http://ai-finance-api.int:8000/healthz
curl http://api.ai-finance.int:8000/healthz
```

### Frontend to Backend (within infra_net)
```javascript
// If web container joins infra_net
fetch('http://ai-finance-api.int:8000/api/transactions')
```

## Testing DNS Resolution

From any container on `infra_net`:

```bash
# Test nginx alias
nslookup ai-finance.int

# Test backend alias
nslookup ai-finance-api.int

# Test database alias
nslookup ai-finance-db.int
```

## Configuration

The aliases are defined in `docker-compose.yml`:

```yaml
services:
  postgres:
    networks:
      default:
      infra_net:
        aliases:
          - ai-finance-db.int

  backend:
    networks:
      default:
      infra_net:
        aliases:
          - ai-finance-api.int

  nginx:
    networks:
      default:
      infra_net:
        aliases:
          - ai-finance.int
```

## Important Notes

- Aliases are **only available on the `infra_net` network**
- The `default` network still uses standard Docker DNS (`nginx`, `backend`, `postgres`)
- Aliases persist across `docker compose restart` and `docker compose up -d --force-recreate`
- If you change the aliases, restart the containers: `docker compose up -d`

## Verification

Check all aliases are registered:
```powershell
docker network inspect infra_net
```

Test from nginx container:
```powershell
docker exec ai-finance-nginx-1 nslookup ai-finance.int
docker exec ai-finance-nginx-1 nslookup ai-finance-api.int
docker exec ai-finance-nginx-1 nslookup ai-finance-db.int
```

## Next Steps

Update your Cloudflare tunnel configuration to use `ai-finance.int` instead of `ai-finance-nginx-1` for stable routing.
