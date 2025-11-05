# Dev Unlock - Local Smoke Test Script
# Run this to verify persistent unlock works locally

Write-Host "`n🔧 Dev Unlock Persistent Session - Smoke Test`n" -ForegroundColor Cyan

# Step 1: Set environment variables
Write-Host "Step 1: Setting environment variables..." -ForegroundColor Yellow
$env:APP_ENV = 'dev'
$env:ALLOW_DEV_ROUTES = '1'
$env:DEV_SUPERUSER_EMAIL = 'leoklemet.pa@gmail.com'
$env:DEV_SUPERUSER_PIN = '946281'

Write-Host "✅ Environment configured:" -ForegroundColor Green
Write-Host "   APP_ENV=$env:APP_ENV"
Write-Host "   ALLOW_DEV_ROUTES=$env:ALLOW_DEV_ROUTES"
Write-Host "   DEV_SUPERUSER_EMAIL=$env:DEV_SUPERUSER_EMAIL"
Write-Host "   DEV_SUPERUSER_PIN=****** (hidden)`n"

# Step 2: Instructions for manual testing
Write-Host "Step 2: Start backend and frontend" -ForegroundColor Yellow
Write-Host "   Backend: cd apps/backend && uvicorn app.main:app --reload"
Write-Host "   Frontend: cd apps/web && pnpm run dev`n"

Write-Host "Step 3: Manual Testing Checklist" -ForegroundColor Yellow
Write-Host "   [ ] Login with: $env:DEV_SUPERUSER_EMAIL"
Write-Host "   [ ] Click 'Account' menu"
Write-Host "   [ ] Click 'Unlock Dev Tools' button"
Write-Host "   [ ] Enter PIN: $env:DEV_SUPERUSER_PIN"
Write-Host "   [ ] Verify toast: 'Dev mode unlocked'"
Write-Host "   [ ] Verify RAG chips visible"
Write-Host "   [ ] Click 'Seed' button → verify success"
Write-Host "   [ ] 🔄 REFRESH PAGE (F5)"
Write-Host "   [ ] Verify RAG chips STILL visible (persistent!)"
Write-Host "   [ ] Click 'Seed' again → verify works without re-unlock"
Write-Host "   [ ] Logout"
Write-Host "   [ ] Login again"
Write-Host "   [ ] Verify RAG chips HIDDEN (unlock cleared)"
Write-Host "   [ ] Re-unlock with PIN"
Write-Host "   [ ] Verify RAG chips visible again`n"

Write-Host "Step 4: Verify Backend Persistence" -ForegroundColor Yellow
Write-Host "   Backend logs should show:"
Write-Host "   - 'Dev unlock persisted to session'"
Write-Host "   - 'Dev unlock persisted to cookie (8h TTL)'"
Write-Host "   On subsequent requests:"
Write-Host "   - 'Dev unlock restored from session' or"
Write-Host "   - 'Dev unlock restored from cookie'`n"

Write-Host "Step 5: Test Persistence Duration" -ForegroundColor Yellow
Write-Host "   [ ] Unlock dev tools"
Write-Host "   [ ] Navigate to different pages"
Write-Host "   [ ] Verify RAG chips visible on all pages"
Write-Host "   [ ] Wait 8+ hours (or delete cookie manually)"
Write-Host "   [ ] Verify RAG chips hidden (cookie expired)"
Write-Host "   [ ] Re-unlock required`n"

Write-Host "Step 6: Test Production Guard (Optional)" -ForegroundColor Yellow
Write-Host "   [ ] Set APP_ENV=prod"
Write-Host "   [ ] Restart backend"
Write-Host "   [ ] Login"
Write-Host "   [ ] Verify 'Unlock Dev Tools' button NOT visible"
Write-Host "   [ ] Try manual unlock:"
Write-Host "       curl -X POST http://localhost:8989/auth/dev/unlock \\"
Write-Host "            -d 'pin=946281' -w '\n%{http_code}\n'"
Write-Host "   [ ] Expect: 403 Forbidden"
Write-Host "   [ ] Try RAG endpoint:"
Write-Host "       curl -X POST http://localhost:8989/agent/tools/rag/seed \\"
Write-Host "            -H 'Content-Type: application/json' -d '{}' -w '\n%{http_code}\n'"
Write-Host "   [ ] Expect: 403 Forbidden`n"

Write-Host "✨ Quick Verification Commands" -ForegroundColor Cyan
Write-Host "   Backend health:"
Write-Host "   curl http://localhost:8989/health`n"
Write-Host "   Dev status (requires auth):"
Write-Host "   curl http://localhost:8989/auth/dev/status -b cookies.txt`n"
Write-Host "   Check cookies (browser DevTools):"
Write-Host "   Application → Cookies → localhost → dev_unlocked = 1`n"

Write-Host "📚 Documentation:" -ForegroundColor Cyan
Write-Host "   - docs/DEV_PIN_GATED_UNLOCK.md"
Write-Host "   - docs/DEV_UNLOCK_PERSISTENT_IMPLEMENTATION.md"
Write-Host "   - apps/web/tests/e2e/DEV_UNLOCK_E2E_TESTS.md`n"

Write-Host "✅ Environment ready for smoke testing!" -ForegroundColor Green
Write-Host "Follow the checklist above to verify persistent unlock.`n"

# Optional: Run automated backend tests
$runTests = Read-Host "Run automated backend tests? (y/n)"
if ($runTests -eq 'y') {
    Write-Host "`n🧪 Running backend tests...`n" -ForegroundColor Cyan
    Set-Location apps/backend
    pytest tests/test_agent_rag_tools.py -v
    pytest tests/test_dev_unlock_prod_guard.py -v
    Set-Location ../..
}

# Optional: Run E2E tests
$runE2E = Read-Host "Run E2E tests? (requires backend + frontend running) (y/n)"
if ($runE2E -eq 'y') {
    Write-Host "`n🎭 Running E2E tests...`n" -ForegroundColor Cyan
    Set-Location apps/web
    $env:DEV_E2E_EMAIL = $env:DEV_SUPERUSER_EMAIL
    $env:DEV_E2E_PASSWORD = 'password123'  # Adjust to your test password
    pnpm run test:e2e dev-unlock
    Set-Location ../..
}

Write-Host "`n✨ Smoke test script complete!" -ForegroundColor Green
