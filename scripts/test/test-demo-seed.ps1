#!/usr/bin/env pwsh
# Test demo seed endpoint with authentication

Write-Host "Testing /demo/seed endpoint..." -ForegroundColor Cyan

# Follow backend logs in background
$logJob = Start-Job -ScriptBlock {
    docker logs ai-finance-backend --follow --tail 50 2>&1
}

Start-Sleep -Seconds 1

Write-Host "`nMaking POST request to /demo/seed..." -ForegroundColor Yellow
Write-Host "(You need to be logged in at localhost:8083 and have cookies set)" -ForegroundColor Gray

# This will fail without proper cookies, but should show backend error logs
curl -v -X POST http://localhost:8083/demo/seed `
  -H "Accept: application/json" `
  2>&1 | Select-Object -First 30

Start-Sleep -Seconds 2

Write-Host "`n=== Recent Backend Logs ===" -ForegroundColor Cyan
Stop-Job $logJob
Receive-Job $logJob | Select-Object -Last 30
Remove-Job $logJob

Write-Host "`nDone. Check logs above for errors." -ForegroundColor Green
