# Cloudflare Tunnel Troubleshooting

## Common Symptoms
| Symptom | Likely Cause | Fix |
|---------|--------------|-----|
| Restart loop, log shows `Incorrect Usage: flag provided but not defined: -no-autoupdate` | Flag placed after subcommand or shell parsing multi-line incorrectly | Use exec array form in compose: `command: ["cloudflared","--no-autoupdate","tunnel","run",...]` |
| 1033 error at edge | Tunnel down / not connected | Ensure logs show `Connected to Cloudflare edge`; restart with fresh token |
| Persistent 502, nginx internal curl 200 | HTTPS origin mismatch (cloudflared → https://nginx:443 but nginx only listens 80) | Change ingress service to `http://nginx:80` and redeploy |
| `unauthorized: invalid token` | Expired / wrong token | Generate new token from Zero Trust → Tunnels → Connect |
| Repeated `registering connection` then disconnect | Network blocks QUIC / IPv6 | Add `--edge-ip-version 4 --protocol http2` |
| DNS still points to old tunnel | Routes not applied | Run `cloudflared tunnel route dns <UUID> domain` for apex + www |
| Works locally via resolve override but fails through edge | SSL/SNI mismatch | Add `originServerName` & proper cert; remove `noTLSVerify` if not required |

## Verification Checklist
1. `docker compose ps cloudflared` → container Up (not restarting).
2. `docker compose logs cloudflared` → contains `Connected to Cloudflare edge`.
3. `cloudflared tunnel list` inside container shows your tunnel healthy.
4. DNS: `nslookup -type=a ledger-mind.org 1.1.1.1` (flattened A), `nslookup -type=cname www.ledger-mind.org 1.1.1.1` shows CNAME to tunnel.
5. Origin direct: `curl -sSI https://ledger-mind.org/ready --resolve ledger-mind.org:443:127.0.0.1 -k` returns 200.
6. Edge: `curl -sSI https://ledger-mind.org/ready` (or PowerShell Invoke-WebRequest) returns 200.

## Recovery Commands
```powershell
# Recreate service with fresh token
$env:CLOUDFLARE_TUNNEL_TOKEN = "<TOKEN>"
docker compose -f docker-compose.prod.yml -f docker-compose.prod.override.yml up -d --force-recreate cloudflared

docker compose -f docker-compose.prod.yml -f docker-compose.prod.override.yml logs -n 120 cloudflared

# Route DNS (idempotent)
docker compose -f docker-compose.prod.yml -f docker-compose.prod.override.yml exec cloudflared cloudflared tunnel route dns <UUID> ledger-mind.org
docker compose -f docker-compose.prod.yml -f docker-compose.prod.override.yml exec cloudflared cloudflared tunnel route dns <UUID> www.ledger-mind.org
```

## Notes
- Keep credentials / tokens out of version control.
- If switching to credentials-file mode, revert to config.yml + `tunnel: <UUID>` and remove `--token`.
- Use `--loglevel debug` temporarily for deeper protocol traces; revert to `info` afterward.
 - QUIC churn (intermittent timeout / datagram manager errors) is usually benign if at least one *Registered tunnel connection* remains; consider forcing HTTP/2 fallback by setting env `TUNNEL_TRANSPORT_PROTOCOL=http2` when diagnosing flaky UDP environments.
 - When normalizing to HTTP origin, also remove stale `https://` entries in `config.yml` to avoid future regressions.
