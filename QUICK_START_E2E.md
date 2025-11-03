# 🚀 Quick Start: E2E Tests

## Prerequisites
```bash
# Set environment variables
$env:DEV_E2E_EMAIL='leoklemet.pa@gmail.com'
$env:DEV_E2E_PASSWORD='Superleo3'
$env:DEV_SUPERUSER_PIN='946281'
$env:DEV_SUPERUSER_EMAIL='leoklemet.pa@gmail.com'
$env:APP_ENV='dev'
$env:ALLOW_DEV_ROUTES='1'
```

## Start Servers
```bash
# Terminal 1: Backend
cd apps/backend
python -m uvicorn app.main:app --reload --port 8989

# Terminal 2: Frontend
cd apps/web
pnpm run dev
```

## Run Tests

### 🔐 Dev Unlock Tests (4 tests)
```bash
cd apps/web
pnpm exec playwright test tests/e2e/dev-unlock.spec.ts
```

### ℹ️ Help Tooltips Tests (7 tests)
```bash
cd apps/web
pnpm exec playwright test tests/e2e/help-tooltips.spec.ts
```

### 🎯 All E2E Tests
```bash
cd apps/web
pnpm exec playwright test tests/e2e/
```

### 🐛 Debug Mode
```bash
pnpm exec playwright test tests/e2e/dev-unlock.spec.ts --ui
pnpm exec playwright test tests/e2e/help-tooltips.spec.ts --debug
```

## Test IDs
- `unlock-dev` - Unlock button in account menu
- `pin-input` - PIN input field (6 digits)
- `pin-submit` - PIN submit button
- `rag-chips` - Dev tools RAG chips container

## Expected Behavior

### Dev Unlock Flow
1. Login → Account Menu → "Unlock Dev Tools"
2. Enter PIN: 946281
3. See toast: "Dev mode unlocked"
4. RAG chips appear below agent tools
5. Seed button works

### Help Tooltips
1. Hover help icon → tooltip appears
2. Mouseleave → tooltip hides
3. Focus help icon → tooltip appears
4. Press ESC → tooltip hides
5. Only one tooltip visible at a time

## Troubleshooting

### Backend not accessible
```bash
# Check backend health
curl http://localhost:8989/health
```

### Frontend not running
```bash
# Check frontend
curl http://localhost:5173
```

### Tests fail on login
```bash
# Verify credentials in .env or environment
echo $env:DEV_E2E_EMAIL
echo $env:DEV_E2E_PASSWORD
```

### PIN unlock fails
```bash
# Verify PIN matches backend
echo $env:DEV_SUPERUSER_PIN
# Should be: 946281
```

## Documentation
- Dev Unlock: `apps/web/tests/e2e/DEV_UNLOCK_E2E_TESTS.md`
- Help Tooltips: `apps/web/tests/e2e/HELP_TOOLTIPS_TESTS.md`
- Full Summary: `IMPLEMENTATION_SUMMARY.md`

## CI Integration
```yaml
- name: E2E Tests
  run: pnpm -C apps/web exec playwright test tests/e2e/
  env:
    DEV_E2E_EMAIL: ${{ secrets.DEV_E2E_EMAIL }}
    DEV_E2E_PASSWORD: ${{ secrets.DEV_E2E_PASSWORD }}
    DEV_SUPERUSER_PIN: ${{ secrets.DEV_SUPERUSER_PIN }}
```

---
✅ **Status**: All tests implemented and validated
📊 **Total**: 11 E2E tests (4 dev unlock + 7 help tooltips)
🎯 **Coverage**: Authentication, dev unlock, accessibility, tooltips
