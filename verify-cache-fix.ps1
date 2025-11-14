# Cloudflare Cache Verification Script
# Run this AFTER purging Cloudflare cache to verify the fix

Write-Host "`n=== Cloudflare Cache Verification ===" -ForegroundColor Cyan
Write-Host "Run this after purging CF cache`n" -ForegroundColor Yellow

# 1. Check what bundle HTML references
Write-Host "[1/5] Checking HTML bundle reference..." -ForegroundColor Green
$htmlContent = curl -s https://app.ledger-mind.org/
$bundleRef = $htmlContent | Select-String -Pattern 'src="/assets/(main-[^"]+\.js)"'
if ($bundleRef) {
    $bundleName = $bundleRef.Matches.Groups[1].Value
    Write-Host "  ✓ Bundle in HTML: $bundleName" -ForegroundColor Green

    if ($bundleName -like "*DCJyg88Y*") {
        Write-Host "  ❌ STILL OLD BUNDLE! Cache purge may not have propagated yet." -ForegroundColor Red
        Write-Host "     Wait 1-2 minutes and run this script again." -ForegroundColor Yellow
    } elseif ($bundleName -like "*Chr9uN05*") {
        Write-Host "  ✅ CORRECT! Fresh bundle detected." -ForegroundColor Green
    } else {
        Write-Host "  ⚠️  Different bundle: $bundleName (might be newer)" -ForegroundColor Yellow
    }
} else {
    Write-Host "  ❌ Could not find bundle reference in HTML" -ForegroundColor Red
}

# 2. Check bundle availability
Write-Host "`n[2/5] Checking bundle availability..." -ForegroundColor Green
$response = curl -I https://app.ledger-mind.org/assets/main-Chr9uN05.js 2>&1
$statusLine = $response | Select-String -Pattern "HTTP/\d\.\d (\d+)"
if ($statusLine) {
    $status = $statusLine.Matches.Groups[1].Value
    if ($status -eq "200") {
        Write-Host "  ✅ Bundle returns 200 OK" -ForegroundColor Green
    } else {
        Write-Host "  ❌ Bundle returns $status" -ForegroundColor Red
    }
}

# 3. Check HTML cache headers
Write-Host "`n[3/5] Checking HTML cache headers..." -ForegroundColor Green
$htmlHeaders = curl -I https://app.ledger-mind.org/ 2>&1
$cacheStatus = $htmlHeaders | Select-String -Pattern "cf-cache-status: (\w+)"
if ($cacheStatus) {
    $status = $cacheStatus.Matches.Groups[1].Value
    Write-Host "  CF Cache Status: $status" -ForegroundColor Cyan
    if ($status -eq "BYPASS" -or $status -eq "DYNAMIC") {
        Write-Host "  ✅ HTML bypassing cache (correct!)" -ForegroundColor Green
    } elseif ($status -eq "HIT") {
        Write-Host "  ⚠️  HTML being cached (cache rule may not be active)" -ForegroundColor Yellow
    } else {
        Write-Host "  ℹ️  Status: $status" -ForegroundColor Cyan
    }
}

# 4. Check origin vs edge consistency
Write-Host "`n[4/5] Checking origin consistency..." -ForegroundColor Green
try {
    $originBundle = docker exec ai-finance-agent-oss-clean-nginx-1 sh -c "grep -o 'main-[^\`"]*\.js' /usr/share/nginx/html/index.html" 2>&1
    Write-Host "  Origin (nginx): $originBundle" -ForegroundColor Cyan
    Write-Host "  Edge (CF):      $bundleName" -ForegroundColor Cyan
    if ($originBundle -eq $bundleName) {
        Write-Host "  ✅ MATCH! Origin and edge are synchronized." -ForegroundColor Green
    } else {
        Write-Host "  ❌ MISMATCH! CF still serving stale content." -ForegroundColor Red
    }
} catch {
    Write-Host "  ⚠️  Could not check origin (container may not be running)" -ForegroundColor Yellow
}

# 5. Summary
Write-Host "`n=== Summary ===" -ForegroundColor Cyan
if ($bundleName -like "*Chr9uN05*" -and $status -eq "200") {
    Write-Host "✅ Cache purge successful! Ready to run tests." -ForegroundColor Green
    Write-Host "`nNext step:" -ForegroundColor Yellow
    Write-Host "cd C:\ai-finance-agent-oss-clean\apps\web" -ForegroundColor White
    Write-Host "`$env:IS_PROD='true'; `$env:PW_SKIP_WS='1'; `$env:BASE_URL='https://app.ledger-mind.org'" -ForegroundColor White
    Write-Host "pnpm exec playwright test tests/e2e/debug-chatdock-mount.spec.ts --project=chromium-prod --reporter=line" -ForegroundColor White
} else {
    Write-Host "⚠️  Cache may still be propagating. Wait 1-2 minutes and re-run." -ForegroundColor Yellow
    Write-Host "`nIf issue persists after 5 minutes:" -ForegroundColor Yellow
    Write-Host "  1. Verify cache rules are deployed in CF dashboard" -ForegroundColor White
    Write-Host "  2. Try purging by URL: /, /index.html" -ForegroundColor White
    Write-Host "  3. Check browser cache (Ctrl+Shift+R hard refresh)" -ForegroundColor White
}

Write-Host ""
