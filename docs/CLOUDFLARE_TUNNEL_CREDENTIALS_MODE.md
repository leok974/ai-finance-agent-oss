# Cloudflare Tunnel: Credentials-File Mode

This guide converts the deployment from token (`--token ...`) mode to **credentials-file** mode for stability and easier rotation.

## Why Switch?
Token copy/paste issues (trailing quotes, wrapping, hidden BOM) caused repeated `Unauthorized: Invalid tunnel secret` loops. Credentials-file mode uses the signed JSON produced when you create the tunnel—eliminating token shape ambiguity.

## Concepts
- Tunnel UUID: The canonical ID (e.g. `6a9e2d7e-9c48-401b-bdfd-ab219d3d4df5`).
- Credentials file: `<UUID>.json` containing `accountTag`, `tunnelSecret`, etc. Generated once per tunnel creation/login.
- `config.yml`: Declares `tunnel`, `credentials-file`, and `ingress` rules.

## One-Time Setup
```powershell
# 1. Authenticate (interactive browser flow)
cloudflared tunnel login

# 2. Create named tunnel (choose a stable name; re-run only if recreating)
cloudflared tunnel create ledgermind-prod
# Output: Creates %USERPROFILE%\.cloudflared\<UUID>.json

# 3. (Optional) List tunnels
cloudflared tunnel list

# 4. Copy credentials file into repo (DO NOT COMMIT!)
# From: %USERPROFILE%\.cloudflared\6a9e2d7e-9c48-401b-bdfd-ab219d3d4df5.json
#   To:   ./cloudflared/6a9e2d7e-9c48-401b-bdfd-ab219d3d4df5.json

# 5. Ensure ./cloudflared/config.yml contains:
# tunnel: 6a9e2d7e-9c48-401b-bdfd-ab219d3d4df5
# credentials-file: /etc/cloudflared/6a9e2d7e-9c48-401b-bdfd-ab219d3d4df5.json
# ingress:
#   - hostname: app.ledger-mind.org
#     service: http://nginx:80
#   - hostname: ledger-mind.org
#     service: http://nginx:80
#   - hostname: www.ledger-mind.org
#     service: http://nginx:80
#   - service: http_status:404
```

## DNS (if not auto-routed)
```powershell
# Run after container is up (idempotent):
docker compose -f docker-compose.prod.yml -f docker-compose.prod.override.yml exec cloudflared `
  cloudflared tunnel route dns 6a9e2d7e-9c48-401b-bdfd-ab219d3d4df5 ledger-mind.org

docker compose -f docker-compose.prod.yml -f docker-compose.prod.override.yml exec cloudflared `
  cloudflared tunnel route dns 6a9e2d7e-9c48-401b-bdfd-ab219d3d4df5 www.ledger-mind.org

docker compose -f docker-compose.prod.yml -f docker-compose.prod.override.yml exec cloudflared `
  cloudflared tunnel route dns 6a9e2d7e-9c48-401b-bdfd-ab219d3d4df5 app.ledger-mind.org
```

## Bring Up / Refresh
```powershell
docker --context desktop-linux compose -f docker-compose.prod.yml -f docker-compose.prod.override.yml up -d --force-recreate --no-deps cloudflared

docker --context desktop-linux compose -f docker-compose.prod.yml -f docker-compose.prod.override.yml logs --tail=120 cloudflared
```
Expected healthy log lines:
- Registered tunnel connection
- Connection <id> registered

Absence of: Unauthorized: Invalid tunnel secret

## Verification
```powershell
# Local edge check (replace domain if using subdomain only)
Invoke-WebRequest https://ledger-mind.org/_up -MaximumRedirection 0 | Select-Object StatusCode
Invoke-WebRequest https://ledger-mind.org/version | Select-Object StatusCode, Content
```
Headers should include: Content-Security-Policy, Strict-Transport-Security, Referrer-Policy.

## Rotating the Tunnel Secret
If you must rotate:
```powershell
cloudflared tunnel delete ledgermind-prod   # (Only if recreating!)
cloudflared tunnel create ledgermind-prod
# Copy new <UUID>.json into ./cloudflared
# Update tunnel UUID in config.yml if it changed
# Recreate container
```

## Secure Handling
- DO NOT commit the credentials JSON.
- Optionally add pattern to .gitignore:
```
cloudflared/*.json
```
(If not already covered.)

## Migrating From Token Mode
1. Remove `--token` args in compose (already done).
2. Add volume mount `./cloudflared:/etc/cloudflared:ro` (done).
3. Add `credentials-file` line to `config.yml` (done).
4. Provide credentials JSON and recreate service.

## Troubleshooting
| Symptom | Check |
|---------|-------|
| Still seeing `Invalid tunnel secret` | Wrong / stale JSON file; ensure matches tunnel UUID in config.yml |
| 530 at edge | Tunnel not fully registered; check logs for Registered lines |
| Only 1 connection active | Network path constraints; may still be okay but watch for flaps |
| QUIC handshake noise | Force HTTP2 by adding `--protocol http2` temporarily |

## Next Steps
- Update `DEPLOY.md` to reference this credentials flow.
- Remove obsolete token loader script if unneeded.
