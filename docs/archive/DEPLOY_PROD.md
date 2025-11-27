# LedgerMind – Production Deploy Cheat-Sheet

**Environment:** Single Docker host, Cloudflare Tunnel already routing `app.ledger-mind.org` → nginx container on port 8083.

**No image registry:** We build locally and run via `docker compose`.

---

## 0. Prerequisites

- **Repo:** `C:\ai-finance-agent-oss-clean` (or your clone)
- **Docker Desktop** running (Linux engine)
- **Prod config:** `docker-compose.prod.yml`
  - `backend` service: `ai-finance-backend` (image `ledgermind-backend:main-<sha>`)
  - `nginx/web` service: `ai-finance-agent-oss-clean-nginx-1` (image `ledgermind-web:main-<sha>`)
  - `pull_policy: never` so Docker uses local images

---

## 1. Get the current commit hash

From repo root:

```powershell
cd C:\ai-finance-agent-oss-clean
git rev-parse --short=8 HEAD
```

Call that value `SHORT_SHA` (e.g. `80920552`).

We'll tag both images as `main-$SHORT_SHA`.

---

## 2. Build backend image

```powershell
cd C:\ai-finance-agent-oss-clean\apps\backend
docker build -t ledgermind-backend:main-80920552 .
```

*(Change `80920552` to whatever `SHORT_SHA` you just got.)*

---

## 3. Build web/nginx image

If you're using the web Dockerfile in `apps/web`:

```powershell
cd C:\ai-finance-agent-oss-clean\apps\web
docker build -t ledgermind-web:main-80920552 .
```

*(Again, swap `80920552` for your `SHORT_SHA`.)*

---

## 4. Point docker-compose to the new tags

Open `docker-compose.prod.yml` and update the images:

```yaml
services:
  backend:
    image: ledgermind-backend:main-80920552
    pull_policy: never
    # ...

  nginx:
    image: ledgermind-web:main-80920552
    pull_policy: never
    # ...
```

Save the file and commit it later as part of the deploy.

---

## 5. Restart prod services with new images

From repo root:

```powershell
cd C:\ai-finance-agent-oss-clean
docker compose -f docker-compose.prod.yml up -d backend nginx
```

This should **not pull** from anywhere (because of `pull_policy: never`) and will use the freshly built images.

---

## 6. Verify containers are healthy

```powershell
docker ps --filter "name=ai-finance" --format "table {{.Names}}\t{{.Status}}\t{{.Image}}"
```

You should see something like:

- `ai-finance-backend` → `ledgermind-backend:main-80920552` → ... Up ... (healthy)
- `ai-finance-agent-oss-clean-nginx-1` → `ledgermind-web:main-80920552` → ... Up ... (healthy)

If nginx shows "unhealthy", check logs:

```powershell
docker logs ai-finance-agent-oss-clean-nginx-1 --tail 50
```

---

## 7. Local smoke tests (before trusting Cloudflare)

```powershell
# HTML shell
curl -I http://localhost:8083/

# API health
curl -I http://localhost:8083/api/ready

# Optional: auth ping (should be 401/403, but not 5xx)
curl -I http://localhost:8083/api/auth/me
```

Expect **HTTP 200** on `/` and `/api/ready`.

Any **5xx** here means fix before worrying about the Cloudflare side.

---

## 8. Cloudflare / public smoke tests

Once local looks good, hit the real domain:

```powershell
# HTML
curl -I https://app.ledger-mind.org/

# API health through tunnel
curl -I https://app.ledger-mind.org/api/ready
```

You should get **200** from the health endpoint. If you see **502/522** etc, that usually means Cloudflare is still pointing at an old/other nginx instance, not the Docker you just started.

---

## 9. Commit + push deploy metadata

From repo root:

```powershell
git add docker-compose.prod.yml
git commit -m "deploy: update prod images to main-80920552"
git push origin main
```

That way the image tags used in prod are always visible in Git history.

---

<!--
LEDGERMIND_PROD_DEPLOY_STEPS

1. Get SHORT_SHA: `git rev-parse --short=8 HEAD`.
2. Build backend image:
   `cd apps/backend && docker build -t ledgermind-backend:main-SHORT_SHA .`
3. Build web image:
   `cd apps/web && docker build -t ledgermind-web:main-SHORT_SHA .`
4. Edit docker-compose.prod.yml:
   - backend.image = `ledgermind-backend:main-SHORT_SHA`
   - nginx.image   = `ledgermind-web:main-SHORT_SHA`
   - keep `pull_policy: never`.
5. Run: `docker compose -f docker-compose.prod.yml up -d backend nginx`.
6. Verify: `curl http://localhost:8083/api/ready` (200) and open https://app.ledger-mind.org in browser.
-->
