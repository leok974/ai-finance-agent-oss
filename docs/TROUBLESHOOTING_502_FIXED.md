# 502 Bad Gateway - Resolution

## Issue Summary

After rebuilding the backend container, the production site at `https://app.ledger-mind.org` was returning **502 Bad Gateway** errors.

## Root Cause

When Docker Compose rebuilds a container, it may get a **new IP address**. Nginx had cached the old backend IP address (`172.18.0.5`) and couldn't reach the new backend container.

## Error Symptoms

- ✅ Cloudflare working
- ✅ Nginx running
- ✅ Backend running (but marked "unhealthy")
- ❌ Nginx → Backend connection failed with "Host is unreachable"

## Resolution Steps

### 1. Restart Cloudflare Tunnel
```powershell
docker compose -f docker-compose.prod.yml restart cloudflared
```

### 2. Restart Nginx
```powershell
docker compose -f docker-compose.prod.yml restart nginx
```

This forces nginx to:
- Re-resolve the `backend` hostname
- Get the new IP address
- Reconnect to the backend

## Verification

```powershell
# Check service status
docker compose -f docker-compose.prod.yml ps

# Test backend directly
curl http://localhost:8000/healthz

# Check nginx logs (should be no more errors)
docker compose -f docker-compose.prod.yml logs --tail=20 nginx
```

## Prevention

To avoid this issue in the future, use one of these strategies:

### Option 1: Static IPs (Recommended)

Update `docker-compose.prod.yml` to assign static IPs:

```yaml
services:
  backend:
    networks:
      app-network:
        ipv4_address: 172.20.0.10

  nginx:
    networks:
      app-network:
        ipv4_address: 172.20.0.20

networks:
  app-network:
    driver: bridge
    ipam:
      config:
        - subnet: 172.20.0.0/16
```

### Option 2: DNS Resolution in Nginx

Use nginx variable resolution to force DNS lookup on every request:

```nginx
# In nginx.conf
resolver 127.0.0.11 valid=10s;  # Docker's internal DNS
set $backend_upstream http://backend:8000;

location / {
    proxy_pass $backend_upstream;
}
```

### Option 3: Restart Script

Create a helper script that automatically restarts nginx after backend rebuild:

```powershell
# rebuild-backend.ps1
docker compose -f docker-compose.prod.yml build backend
docker compose -f docker-compose.prod.yml up -d backend
Start-Sleep -Seconds 5
docker compose -f docker-compose.prod.yml restart nginx
docker compose -f docker-compose.prod.yml restart cloudflared
```

## Current Backend Status

The backend is running but showing **crypto_not_ready** warning:

```json
{
  "ok": false,
  "status": "degraded",
  "reasons": ["crypto_not_ready"],
  "crypto_ready": false
}
```

### Crypto Issue

Error: `No encryption key found for label 'active'`

This is a **separate issue** from the 502. The app will function normally except for encrypted features (like storing sensitive transaction data).

### Fix Crypto (Optional)

If you need encryption working:

1. **Check KMS credentials**:
   ```powershell
   docker compose -f docker-compose.prod.yml exec backend ls -la /secrets/
   ```

2. **Verify GCP service account**:
   ```powershell
   docker compose -f docker-compose.prod.yml exec backend cat /secrets/gcp-sa.json
   ```

3. **Check active-dek.json**:
   ```powershell
   # On host
   cat active-dek.json
   # Should have a DEK for label "active"
   ```

4. **Re-generate DEK** (if missing):
   ```bash
   python rewrap_to_kms.py --label active
   ```

## Summary

✅ **502 Fixed**: Nginx restarted, can now reach backend
⚠️ **Crypto Warning**: Non-blocking, app functional
✅ **Admin Guard**: Deployed in rebuilt containers
✅ **Site**: Should be accessible now at https://app.ledger-mind.org

## Test Admin Guard

Now that the site is up, test the admin guard:

1. **Login as admin**: https://app.ledger-mind.org
2. **Enable dev mode**: Press `Ctrl+Shift+D`
3. **Open Dev menu**: Click "Dev" button
4. **Verify**: "Admin: Category Rules" menu item appears
5. **Toggle panel**: Check it to open AdminRulesPanel

Non-admin users should NOT see the "Admin: Category Rules" menu item.
