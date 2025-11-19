# LedgerMind Production Deployment Quick Reference

## 🚨 Golden Rule
**ALWAYS check `/version.json` before debugging production issues!**

```bash
# Quick check
curl -s https://app.ledger-mind.org/version.json | jq

# Or use the automated script
scripts/check-ledgermind-prod-version.sh   # Bash
.\scripts\check-ledgermind-prod-version.ps1  # PowerShell
```

If the commit doesn't match `git rev-parse --short HEAD`, **STOP** and redeploy nginx first.

---

## 🚀 One-Command Deploy

### Bash (Linux/macOS/WSL)
```bash
# Optional: Clean up orphaned containers first
scripts/cleanup-nginx-orphans.sh

# Deploy nginx
scripts/deploy-ledgermind-nginx.sh

# Verify deployment
scripts/check-ledgermind-prod-version.sh
```

### PowerShell (Windows)
```powershell
# Optional: Clean up orphaned containers first
.\scripts\cleanup-nginx-orphans.ps1

# Deploy nginx
.\scripts\deploy-ledgermind-nginx.ps1

# Verify deployment
.\scripts\check-ledgermind-prod-version.ps1
```

---

## 📋 Manual Deploy Steps

If you prefer manual control:

```bash
# 1. Confirm current branch/commit
git rev-parse --abbrev-ref HEAD
git rev-parse --short=8 HEAD

# 2. Build nginx (--no-cache prevents stale cached layers)
VITE_GIT_BRANCH=$(git rev-parse --abbrev-ref HEAD) \
VITE_GIT_COMMIT=$(git rev-parse --short=8 HEAD) \
BUILD_TIME=$(date -u +"%Y-%m-%dT%H:%M:%SZ") \
docker compose -f docker-compose.prod.yml build --no-cache nginx

# 3. Recreate nginx container
docker compose -f docker-compose.prod.yml up -d --force-recreate nginx

# 4. (Optional) Restart Cloudflare tunnels
docker restart cfd-a cfd-b

# 5. Verify deployment
curl -s https://app.ledger-mind.org/version.json | jq
```

---

## 🔍 Troubleshooting

### Production shows old build after deploy
**Cause:** Docker build cache or browser cache

**Fix:**
```bash
# Force clean rebuild
docker compose -f docker-compose.prod.yml build --no-cache nginx
docker compose -f docker-compose.prod.yml up -d --force-recreate nginx

# Clear browser cache (Ctrl+Shift+Delete, "All time", "Everything")
# Then close and reopen browser
```

### version.json doesn't exist
**Cause:** Old nginx image or broken build

**Fix:**
```bash
# Check if file exists in container
docker exec ai-finance-agent-oss-clean-nginx-1 ls -la /usr/share/nginx/html/version.json

# If missing, rebuild from scratch
docker compose -f docker-compose.prod.yml build --no-cache --pull nginx
```

### Cloudflare Tunnels unhealthy
**Cause:** Tunnels didn't reconnect after nginx restart

**Fix:**
```bash
docker restart cfd-a cfd-b
# Wait 15-20 seconds for reconnection
docker ps | grep cfd  # Should show "Up X seconds"
```

### Multiple nginx containers running
**Cause:** Legacy dev stack not stopped, orphaned containers

**Fix:**
```bash
# Clean up orphaned nginx containers
scripts/cleanup-nginx-orphans.sh  # Bash
.\scripts\cleanup-nginx-orphans.ps1  # PowerShell

# Verify only one LedgerMind nginx container remains
docker ps | grep nginx
```

---

## 📚 More Information

See `docs/CHAT_BUILD_AND_DEPLOY.md` for complete deployment architecture, common issues, and debugging guides.
