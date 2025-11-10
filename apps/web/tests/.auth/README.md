# Playwright Auth State Setup

## Quick Start

### 1. Set credentials (one-time)

```powershell
# Windows PowerShell
$env:PW_EMAIL="your-test-user@example.com"
$env:PW_PASSWORD="your-password"
$env:BASE_URL="https://app.ledger-mind.org"
```

```bash
# macOS/Linux
export PW_EMAIL="your-test-user@example.com"
export PW_PASSWORD="your-password"
export BASE_URL="https://app.ledger-mind.org"
```

### 2. Create/refresh auth state

```powershell
# Build + create auth state (runs globalSetup)
pnpm --dir apps/web exec playwright test --list
```

This will:
- Try API login first (`/api/auth/login`)
- Fall back to UI login if API fails
- Save session to `apps/web/tests/.auth/storageState.json`
- Verify the state is valid

### 3. Run tests with saved auth

```powershell
# Run all chat specs (authenticated)
$env:BASE_URL='https://app.ledger-mind.org'
pnpm --dir apps/web exec playwright test "chat.*.spec.ts" --reporter=line --workers=6
```

## Manual Refresh

If cookies expire or auth state becomes invalid:

```powershell
# Delete old state
Remove-Item apps/web/tests/.auth/storageState.json -ErrorAction Ignore

# Regenerate
pnpm --dir apps/web exec playwright test --list
```

## How It Works

### Global Setup
- Runs before all tests (`global-setup.ts`)
- Checks if existing `storageState.json` is still valid
- If invalid or missing, logs in via:
  1. **API route** (`/api/auth/login`) - fast, no browser
  2. **UI flow** (fallback) - uses real browser, fills login form
- Saves cookies/localStorage to `storageState.json`

### Test Execution
- Playwright loads `storageState.json` for all tests
- Every test starts already logged in
- No need for per-test auth setup
- Tests run faster and more reliably

### Auth Helper
Use `expectLoggedIn()` in critical specs to fail fast if state is stale:

```typescript
import { expectLoggedIn } from '../utils/auth';

test.beforeAll(async () => {
  await expectLoggedIn(
    process.env.BASE_URL!,
    'apps/web/tests/.auth/storageState.json'
  );
});
```

## Troubleshooting

### 401 errors in tests
State is stale. Refresh:
```powershell
Remove-Item apps/web/tests/.auth/storageState.json -ErrorAction Ignore
pnpm --dir apps/web exec playwright test --list
```

### Login fails
Check credentials:
```powershell
echo $env:PW_EMAIL
echo $env:PW_PASSWORD
```

Verify login endpoint works:
```powershell
curl -X POST https://app.ledger-mind.org/api/auth/login `
  -H "Content-Type: application/json" `
  -d '{"email":"your@email.com","password":"your-password"}'
```

### UI login selector issues
If login form selectors changed, update `global-setup.ts`:
```typescript
await page.fill('input[name="email"]', EMAIL);        // ← adjust selector
await page.fill('input[name="password"]', PASSWORD);  // ← adjust selector
await page.click('button[type="submit"]');            // ← adjust selector
```

## CI/CD Integration

Set secrets in GitHub Actions:
```yaml
env:
  PW_EMAIL: ${{ secrets.PW_EMAIL }}
  PW_PASSWORD: ${{ secrets.PW_PASSWORD }}
  BASE_URL: https://app.ledger-mind.org
```

Global setup will run automatically before tests.
