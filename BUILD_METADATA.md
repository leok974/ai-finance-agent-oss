# Build Metadata Flow

This document explains how git metadata (branch, commit, build time) is propagated from the host system through Docker build to the final runtime bundle.

## Architecture Overview

```
Host (PowerShell)
  ↓ git commands
  ↓ $env:VITE_BUILD_BRANCH/COMMIT/TIME
docker-compose.prod.yml
  ↓ build.args: ${VITE_BUILD_*}
Dockerfile.nginx (webbuild stage)
  ↓ ARG VITE_BUILD_* → ENV VITE_BUILD_*
Vite build (apps/web/vite.config.ts)
  ↓ process.env.VITE_BUILD_* → __WEB_BRANCH__, etc.
buildStamp.ts
  ↓ Vite defines → import.meta.env → window globals → defaults
Runtime (Browser Console)
  → 🚀 LedgerMind Web  build  main@7204f00b (2025-11-17T03:09:47.123Z)
```

## Environment Variable Flow

### 1. Host Environment (PowerShell)

Before building, set environment variables from git:

```powershell
$env:VITE_BUILD_BRANCH = (git rev-parse --abbrev-ref HEAD)
$env:VITE_BUILD_COMMIT = (git rev-parse --short HEAD)
$env:VITE_BUILD_TIME   = (Get-Date).ToUniversalTime().ToString("o")
```

**Automated Script**: Use `./build-prod.ps1` which handles this automatically:

```powershell
# Build and deploy
.\build-prod.ps1

# Build only (no deploy)
.\build-prod.ps1 -NoDeploy
```

### 2. docker-compose.prod.yml

The compose file forwards host environment variables as build args:

```yaml
services:
  nginx:
    build:
      context: .
      dockerfile: deploy/Dockerfile.nginx
      args:
        VITE_BUILD_BRANCH: ${VITE_BUILD_BRANCH:-local}
        VITE_BUILD_COMMIT: ${VITE_BUILD_COMMIT:-dev}
        VITE_BUILD_TIME: ${VITE_BUILD_TIME:-unknown}
```

The `${VAR:-default}` syntax provides fallback values if the environment variable is not set.

### 3. Dockerfile.nginx

The webbuild stage receives ARGs and sets them as ENV vars before `pnpm build`:

```dockerfile
FROM node:20-alpine AS webbuild

# Receive build args from docker-compose
ARG VITE_BUILD_BRANCH=local
ARG VITE_BUILD_COMMIT=dev
ARG VITE_BUILD_TIME=unknown

# Set as environment variables for Vite build
ENV VITE_BUILD_BRANCH=${VITE_BUILD_BRANCH} \
    VITE_BUILD_COMMIT=${VITE_BUILD_COMMIT} \
    VITE_BUILD_TIME=${VITE_BUILD_TIME}

# ... copy files ...

# Build runs with VITE_BUILD_* available in process.env
RUN pnpm build
```

### 4. Vite Configuration (apps/web/vite.config.ts)

Vite reads from environment variables with fallback chain:

```typescript
// Prioritize VITE_BUILD_* (Docker), then CI vars, then git fallback
const GIT_COMMIT = process.env.VITE_BUILD_COMMIT ||
                   process.env.GITHUB_SHA ||
                   git("git rev-parse --short=12 HEAD", "dev");

const GIT_BRANCH = process.env.VITE_BUILD_BRANCH ||
                   process.env.GITHUB_REF_NAME ||
                   git("git rev-parse --abbrev-ref HEAD", "local");

const BUILD_TIME = process.env.VITE_BUILD_TIME ||
                   new Date().toISOString();
```

These values are baked into the bundle via Vite's `define`:

```typescript
define: {
  __WEB_BRANCH__: JSON.stringify(GIT_BRANCH),
  __WEB_COMMIT__: JSON.stringify(GIT_COMMIT),
  __WEB_BUILD_TIME__: JSON.stringify(BUILD_TIME),
}
```

### 5. Build Stamp (apps/web/src/buildStamp.ts)

Runtime code uses cascading fallbacks:

```typescript
const getBranch = () => {
  // 1. Vite define (compile-time constant)
  if (typeof __WEB_BRANCH__ !== 'undefined' && __WEB_BRANCH__ !== 'unknown')
    return __WEB_BRANCH__;

  // 2. Vite env (Docker builds)
  if (import.meta.env.VITE_BUILD_BRANCH)
    return import.meta.env.VITE_BUILD_BRANCH;

  // 3. Window global (runtime injection)
  if ((window as any).__LM_BRANCH__)
    return (window as any).__LM_BRANCH__;

  // 4. Fallback
  return 'local';
};

export const BUILD_STAMP = `${BRANCH}@${COMMIT} (${BUILD_TIME})`;
```

### 6. Console Banners (apps/web/src/main.tsx)

The app prints styled console banners on load:

```typescript
const banner = [
  "%c🚀 LedgerMind Web%c  build %c" + BUILD_STAMP,
  "background:#0f172a;color:#38bdf8;font-weight:bold;padding:2px 6px;border-radius:4px 0 0 4px;",
  "background:#0f172a;color:#e5e7eb;padding:2px 4px;",
  "background:#0f172a;color:#a5b4fc;font-family:monospace;padding:2px 6px;border-radius:0 4px 4px 0;",
];
console.info(...banner);
```

Output example:
```
🚀 LedgerMind Web  build  main@7204f00b (2025-11-17T03:09:47.123Z)
```

## Verification

### During Build

Check Vite logs during build:

```powershell
docker compose --progress plain -f docker-compose.prod.yml build nginx 2>&1 | Select-String "vite-config"
```

Expected output:
```
[vite-config] GIT_BRANCH = main GIT_COMMIT = 7204f00b
```

### After Deployment

Check built bundle contains correct values:

```powershell
docker exec ai-finance-agent-oss-clean-nginx-1 grep -ao "main@7204f00b" /usr/share/nginx/html/assets/main*.js | head -1
```

Expected output:
```
main@7204f00b
```

### In Browser

1. Open https://app.ledger-mind.org
2. Open DevTools Console (F12)
3. Hard refresh (Ctrl+Shift+R or Ctrl+F5)
4. Check for styled banner:

```
🚀 LedgerMind Web  build  main@7204f00b (2025-11-17T03:09:47.123Z)
💬 ChatDock v2 overlay-card layout active
```

## Troubleshooting

### Build shows "local@dev" instead of actual git values

**Cause**: Environment variables not set before build.

**Solution**: Use `./build-prod.ps1` script which sets them automatically, or set manually:

```powershell
$env:VITE_BUILD_BRANCH = (git rev-parse --abbrev-ref HEAD)
$env:VITE_BUILD_COMMIT = (git rev-parse --short HEAD)
$env:VITE_BUILD_TIME   = (Get-Date).ToUniversalTime().ToString("o")
docker compose -f docker-compose.prod.yml build nginx
```

### Vite logs show "git command failed"

**Expected**: This is normal inside Docker container without .git mounted. Vite falls back to environment variables.

**Fix**: Ensure `VITE_BUILD_*` environment variables are set (see above).

### Browser shows old build stamp after deployment

**Cause**: Browser cache.

**Solution**: Hard refresh (Ctrl+Shift+R) or "Empty cache and hard reload" in DevTools.

### Build stamp shows wrong timestamp

**Cause**: `VITE_BUILD_TIME` not set, falling back to build-time `new Date().toISOString()`.

**Solution**: Ensure `$env:VITE_BUILD_TIME` is set before build (handled by `build-prod.ps1`).

## Fallback Behavior

| Source | Priority | When Used |
|--------|----------|-----------|
| `process.env.VITE_BUILD_*` | 1 (Highest) | Docker builds with env args |
| `process.env.GITHUB_SHA/REF_NAME` | 2 | GitHub Actions CI/CD |
| `git rev-parse ...` | 3 | Local development |
| `"local"` / `"dev"` | 4 (Lowest) | All sources failed |

## Related Files

- `build-prod.ps1` - Automated build script with git metadata
- `docker-compose.prod.yml` - Build args configuration
- `deploy/Dockerfile.nginx` - ARG/ENV declarations
- `apps/web/vite.config.ts` - Environment variable reading
- `apps/web/src/buildStamp.ts` - Runtime fallback logic
- `apps/web/src/main.tsx` - Console banner output
- `apps/web/src/components/ChatDock.tsx` - ChatDock v2 activation log

## See Also

- `.github/copilot-instructions.md` - API path and networking conventions
- `ARCHITECTURE_DEMO_COMMANDS.md` - System architecture overview
- `CHANGELOG.md` - Version history and releases
