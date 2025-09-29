## Deployment Guide

### Cloudflare Tunnel (Credentials-File Mode)

We use the declarative credentials-file approach (no runtime `--token`) for reproducibility and fewer copy/paste errors.

#### One-Time Tunnel Creation (local workstation)
```powershell
cloudflared tunnel login
cloudflared tunnel create ledger-mind-prod   # shows UUID like 6a9e2d7e-9c48-401b-bdfd-ab219d3d4df5
```
This generates `%USERPROFILE%\.cloudflared\<UUID>.json`.

Copy that JSON into the repository (uncommitted) at `./cloudflared/<UUID>.json`.
Add / confirm `.gitignore` contains:
```
cloudflared/*.json
```

#### Config File
`cloudflared/config.yml` example:
```yaml
tunnel: 6a9e2d7e-9c48-401b-bdfd-ab219d3d4df5
credentials-file: /etc/cloudflared/6a9e2d7e-9c48-401b-bdfd-ab219d3d4df5.json
originRequest:
  connectTimeout: 10s
  tcpKeepAlive: 30s
  noHappyEyeballs: true
  originServerName: ledger-mind.org
  noTLSVerify: false
ingress:
  - hostname: app.ledger-mind.org
    service: http://nginx:80
  - hostname: ledger-mind.org
    service: http://nginx:80
  - hostname: www.ledger-mind.org
    service: http://nginx:80
  - service: http_status:404
```

#### Compose Override Snippet
```yaml
cloudflared:
  image: cloudflare/cloudflared:latest
  command: ["tunnel","--config","/etc/cloudflared/config.yml","--no-autoupdate","--loglevel","info","--protocol","auto","--metrics","0.0.0.0:2000","run"]
  environment:
    TUNNEL_TOKEN: ""   # explicitly disabled
  volumes:
    - ./cloudflared:/etc/cloudflared:ro
  depends_on:
    - nginx
  restart: unless-stopped
```

#### Bring Up / Refresh
```powershell
docker --context desktop-linux compose -f docker-compose.prod.yml -f docker-compose.prod.override.yml up -d --force-recreate --no-deps cloudflared
docker --context desktop-linux compose -f docker-compose.prod.yml -f docker-compose.prod.override.yml logs --tail=120 cloudflared
```
Expect 4 lines starting with `Registered tunnel connection` and no `Unauthorized: Invalid tunnel secret`.

#### DNS Routing
If hostnames are new or you removed existing records:
```powershell
docker --context desktop-linux compose -f docker-compose.prod.yml -f docker-compose.prod.override.yml exec cloudflared `
  cloudflared tunnel route dns 6a9e2d7e-9c48-401b-bdfd-ab219d3d4df5 ledger-mind.org
```
Repeat for `www.ledger-mind.org` and `app.ledger-mind.org`. If a record already exists you may need to convert it manually to a proxied CNAME pointing to `<UUID>.cfargotunnel.com`.

#### Validation Script
Run after any change to catch mismatches:
```powershell
pwsh -File scripts/validate-cloudflared-config.ps1
```

#### Rotation
To rotate (rare):
```powershell
cloudflared tunnel delete ledger-mind-prod   # only if recreating entirely
cloudflared tunnel create ledger-mind-prod
# Copy new <NEW-UUID>.json, update config.yml, recreate container
```

#### Metrics
Metrics exposed at `http://127.0.0.1:2000/metrics` inside container. Look for `cloudflared_tunnel_ha_connections 4`.

#### Notes
* Pin cloudflared image version in production.
* QUIC is default; force HTTP/2 with `--protocol http2` during network debugging.
* Validation script also ensures `TUNNEL_TOKEN` is empty to prevent regressions.

---
