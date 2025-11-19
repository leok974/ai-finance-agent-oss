# Scripts Directory

This directory contains automation scripts for building, deploying, and verifying the LedgerMind application.

## Production Deployment Scripts

### `deploy-ledgermind-nginx.sh` / `deploy-ledgermind-nginx.ps1`

**Purpose:** Deploy production nginx container with fresh build (no Docker cache).

**What it does:**
1. Extracts current Git branch and commit
2. Builds nginx Docker image with Git metadata injected as build args
3. Uses `--no-cache` flag to prevent stale cached layers
4. Recreates nginx container with fresh image
5. Restarts Cloudflare tunnels (`cfd-a`, `cfd-b`) if present

**Usage:**
```bash
# Bash
scripts/deploy-ledgermind-nginx.sh

# PowerShell
.\scripts\deploy-ledgermind-nginx.ps1

# Custom compose file
COMPOSE_FILE=ops/docker-compose.prod.yml scripts/deploy-ledgermind-nginx.sh
```

**When to use:**
- After merging code changes to main/production branch
- When frontend bundle needs to be updated
- When build metadata is out of sync

---

### `check-ledgermind-prod-version.sh` / `check-ledgermind-prod-version.ps1`

**Purpose:** Verify production build matches local Git HEAD.

**What it does:**
1. Fetches `https://app.ledger-mind.org/version.json`
2. Compares remote `branch` + `commit` to local Git HEAD
3. Exits 0 if match (safe to debug), exits 1 if mismatch

**Usage:**
```bash
# Bash
scripts/check-ledgermind-prod-version.sh

# PowerShell
.\scripts\check-ledgermind-prod-version.ps1

# Custom URL
URL=https://staging.ledger-mind.org/version.json scripts/check-ledgermind-prod-version.sh
```

**When to use:**
- **ALWAYS** before debugging production issues
- After deploying to verify success
- In CI/CD pipelines to gate deployments

**Example output:**
```
>>> Checking LedgerMind prod version at https://app.ledger-mind.org/version.json

Remote: branch=main commit=917f9184
Local : branch=main commit=917f9184

✅ Prod matches local HEAD. Safe to debug app behavior.
```

---

### `cleanup-nginx-orphans.sh` / `cleanup-nginx-orphans.ps1`

**Purpose:** Remove orphaned nginx containers from legacy compose stacks.

**What it does:**
1. Shows expected nginx container from production compose file
2. Lists all nginx-related containers currently running
3. Stops legacy dev stack (`docker-compose.yml`)
4. Removes orphaned containers via `--remove-orphans` flag
5. Shows final state after cleanup

**Usage:**
```bash
# Bash
scripts/cleanup-nginx-orphans.sh

# PowerShell
.\scripts\cleanup-nginx-orphans.ps1

# Custom compose file
COMPOSE_FILE=ops/docker-compose.prod.yml scripts/cleanup-nginx-orphans.sh
```

**When to use:**
- After switching from dev to prod compose configuration
- When you see multiple nginx containers competing for ports
- After `docker compose` warns about orphaned containers
- Before deploying to ensure clean slate

**Example output:**
```
>>> Expected nginx containers from docker-compose.prod.yml:
ai-finance-agent-oss-clean-nginx-1   Up 12 minutes   127.0.0.1:8083->80/tcp

>>> Stopping legacy dev stack (docker-compose.yml)...
✔ Container ai-finance-nginx-1 Removed

>>> After cleanup:
ai-finance-agent-oss-clean-nginx-1   Up 12 minutes   ai-finance-agent-oss-clean-nginx:latest
```

---

## Build Scripts

### `build-stamp.mjs`

**Purpose:** Generate `src/build-stamp.json` with Git metadata for Vite build.

**Called by:** Docker build process, `pnpm build` scripts

**Outputs:**
```json
{
  "branch": "main",
  "commit": "917f9184",
  "buildId": "prod-2025-11-18-18-46-27",
  "ts": "2025-11-18T23:46:27.108Z",
  "isDev": false
}
```

---

### `build-favicon.mjs`

**Purpose:** Generate favicon set from source SVG.

**Usage:**
```bash
cd apps/web
node scripts/build-favicon.mjs
```

---

### `verify-charts-norm.mjs`

**Purpose:** Verify chart panel normalization (slug conversion).

**Usage:**
```bash
cd apps/web
node scripts/verify-charts-norm.mjs
```

---

## Linting & Quality Scripts

### `eslint-budget-*.cjs`

**Purpose:** ESLint error/warning budgets and ratcheting.

- `eslint-budget-ratchet.cjs` - Enforce error reduction over time
- `eslint-budget-set-baseline.cjs` - Set new baseline
- `compare-eslint-budget.cjs` - Compare current vs baseline
- `compare-eslint-rules.cjs` - Compare rule-specific errors

**Usage:**
```bash
cd apps/web
pnpm lint:budget        # Check against budget
pnpm lint:budget:set    # Update baseline
```

---

## Development Scripts

### `chat-hot-reload.mjs`

**Purpose:** Hot reload chat iframe during development.

**Usage:** Automatically called by Vite dev server when chat files change.

---

### `dev-server.mjs`

**Purpose:** Development server with API proxy and hot reload.

**Usage:**
```bash
cd apps/web
node scripts/dev-server.mjs
```

---

## Testing Scripts

Located in `apps/web/scripts/` - see individual files for documentation.

---

## Script Conventions

### File Extensions
- `.sh` - Bash scripts (Linux/macOS/WSL)
- `.ps1` - PowerShell scripts (Windows)
- `.mjs` - ES Module Node.js scripts
- `.cjs` - CommonJS Node.js scripts

### Environment Variables
Scripts respect these environment variables:
- `COMPOSE_FILE` - Docker Compose file path (default: `docker-compose.prod.yml`)
- `VITE_GIT_BRANCH` - Git branch for build metadata
- `VITE_GIT_COMMIT` - Git commit hash for build metadata
- `BUILD_TIME` - ISO 8601 build timestamp
- `URL` - Version check endpoint URL

### Exit Codes
- `0` - Success
- `1` - Error or validation failure

---

## Best Practices

1. **Always verify before debugging:** Run `check-ledgermind-prod-version.sh` before investigating production issues
2. **Use --no-cache for prod builds:** Prevents Docker layer caching issues
3. **Restart tunnels after nginx deploy:** Ensures Cloudflare Tunnel picks up new container
4. **Check version.json after deploy:** Confirms deployment succeeded

---

## Adding New Scripts

When adding scripts to this directory:
1. Add executable permissions: `chmod +x scripts/your-script.sh`
2. Include shebang line: `#!/usr/bin/env bash` or `#!/usr/bin/env node`
3. Set strict error handling: `set -euo pipefail` (bash) or `$ErrorActionPreference = "Stop"` (PowerShell)
4. Document purpose and usage in this README
5. Add examples of expected output
6. Consider creating both `.sh` and `.ps1` versions for cross-platform support
