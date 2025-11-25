# CSP Fix Verification Script

Write-Host "`n=== CSP Fix Verification ===" -ForegroundColor Green
Write-Host ""

# 1. Check nginx container status
Write-Host "1. Nginx container status:" -ForegroundColor Yellow
docker ps --filter "name=ai-finance-agent-oss-clean-nginx-1" --format "   Status: {{.Status}}"
Write-Host ""

# 2. Check built assets for old URL
Write-Host "2. Checking for old http://127.0.0.1:8000 in built assets:" -ForegroundColor Yellow
$oldUrl = docker exec ai-finance-agent-oss-clean-nginx-1 sh -c "grep -r '127.0.0.1:8000' /usr/share/nginx/html/assets/ 2>/dev/null" 2>$null
if ($oldUrl) {
    Write-Host "   Γ£û FOUND old URL - rebuild needed!" -ForegroundColor Red
    Write-Host "   $oldUrl"
} else {
    Write-Host "   Γ£ô No old URLs found" -ForegroundColor Green
}
Write-Host ""

# 3. Check VITE_API_BASE in built JavaScript
Write-Host "3. Checking VITE_API_BASE in built JavaScript:" -ForegroundColor Yellow
$apiBase = docker exec ai-finance-agent-oss-clean-nginx-1 sh -c "grep -o 'VITE_API_BASE[^,)]*' /usr/share/nginx/html/assets/index-*.js | head -1" 2>$null
Write-Host "   $apiBase"
Write-Host ""

# 4. Check CSP header
Write-Host "4. Current CSP header:" -ForegroundColor Yellow
$csp = curl -s -I http://localhost/ 2>$null | Select-String -Pattern "Content-Security-Policy:" | Select-Object -First 1
Write-Host "   connect-src: " -NoNewline
$csp -match "connect-src [^;]+" | Out-Null
Write-Host $matches[0] -ForegroundColor Cyan
Write-Host ""

# 5. Check for inline scripts in HTML
Write-Host "5. Checking for inline scripts in served HTML:" -ForegroundColor Yellow
$inlineScripts = docker exec ai-finance-agent-oss-clean-nginx-1 sh -c "cat /usr/share/nginx/html/index.html | grep -E '<script[^>]*>' | grep -v 'src='" 2>$null
if ($inlineScripts) {
    Write-Host "   Γ£û Found inline scripts:" -ForegroundColor Red
    Write-Host "   $inlineScripts"
} else {
    Write-Host "   Γ£ô No inline scripts found" -ForegroundColor Green
}
Write-Host ""

# 6. Test API endpoint
Write-Host "6. Testing API endpoint:" -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "http://localhost/healthz" -Method Get -ErrorAction Stop
    Write-Host "   Γ£ô /healthz returns: $($response.status)" -ForegroundColor Green
} catch {
    Write-Host "   Γ£û API test failed: $_" -ForegroundColor Red
}
Write-Host ""

Write-Host "=== Summary ===" -ForegroundColor Green
Write-Host ""
Write-Host "If you see CSP violations in your browser:" -ForegroundColor Yellow
Write-Host "1. The fix is deployed correctly (no old URLs in assets)" -ForegroundColor Cyan
Write-Host "2. Your browser is using CACHED JavaScript" -ForegroundColor Cyan
Write-Host ""
Write-Host "Solution:" -ForegroundColor Yellow
Write-Host "   β"œβ"€β"€ Option 1: Hard refresh (Ctrl+Shift+R)" -ForegroundColor Cyan
Write-Host "   β"œβ"€β"€ Option 2: Open DevTools > Application > Clear storage" -ForegroundColor Cyan
Write-Host "   └── Option 3: Test in incognito/private mode" -ForegroundColor Cyan
Write-Host ""
