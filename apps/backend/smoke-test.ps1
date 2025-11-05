#!/usr/bin/env pwsh
# Production Smoke Test for LedgerMind RAG System
# Tests: Health check, embeddings count, semantic search quality

$ErrorActionPreference = "Stop"

Write-Host "🔥 LedgerMind RAG Smoke Test" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan

# Step 1: Port forward to backend service
Write-Host "`n[1/4] Setting up port-forward to lm-backend-svc..." -ForegroundColor Yellow
$portForwardJob = Start-Job -ScriptBlock {
    kubectl -n lm port-forward svc/lm-backend-svc 8080:80
}
Start-Sleep -Seconds 3

try {
    # Step 2: Health check
    Write-Host "[2/4] Testing /healthz endpoint..." -ForegroundColor Yellow
    $health = Invoke-RestMethod -Uri "http://localhost:8080/healthz" -Method Get -ErrorAction Stop

    if ($health.status -eq "ok") {
        Write-Host "✅ Health check PASSED" -ForegroundColor Green
        Write-Host "   DB: $($health.checks.db)" -ForegroundColor Gray
        Write-Host "   Migrations: $($health.checks.migrations)" -ForegroundColor Gray
        Write-Host "   RAG Tables: $($health.checks.rag_tables)" -ForegroundColor Gray
        Write-Host "   Embeddings Count: $($health.checks.embeddings_count)" -ForegroundColor Gray

        if ($health.checks.embeddings_count -lt 500) {
            Write-Host "⚠️  WARNING: Only $($health.checks.embeddings_count) embeddings found (expected 632+)" -ForegroundColor Yellow
        }
    }
    else {
        Write-Host "❌ Health check FAILED: $($health.status)" -ForegroundColor Red
        exit 1
    }

    # Step 3: Semantic search test - credit cards
    Write-Host "`n[3/4] Testing semantic search (credit card rewards)..." -ForegroundColor Yellow
    $query1 = @{
        q = "How do credit card rewards work?"
        k = 3
    } | ConvertTo-Json

    $results1 = Invoke-RestMethod -Uri "http://localhost:8080/agent/rag/query" `
        -Method Post `
        -ContentType "application/json" `
        -Body $query1 `
        -ErrorAction Stop

    if ($results1.results.Count -ge 1) {
        $topScore = [math]::Round($results1.results[0].score, 3)
        Write-Host "✅ Query 1 PASSED - Found $($results1.results.Count) results" -ForegroundColor Green
        Write-Host "   Top result: $($results1.results[0].url) (score: $topScore)" -ForegroundColor Gray

        if ($topScore -lt 0.3) {
            Write-Host "⚠️  WARNING: Low relevance score $topScore (expected >0.4)" -ForegroundColor Yellow
        }
    }
    else {
        Write-Host "❌ Query 1 FAILED: No results returned" -ForegroundColor Red
        exit 1
    }

    # Step 4: Semantic search test - budgeting
    Write-Host "`n[4/4] Testing semantic search (budget planning)..." -ForegroundColor Yellow
    $query2 = @{
        q = "What are good budget planning tips?"
        k = 3
    } | ConvertTo-Json

    $results2 = Invoke-RestMethod -Uri "http://localhost:8080/agent/rag/query" `
        -Method Post `
        -ContentType "application/json" `
        -Body $query2 `
        -ErrorAction Stop

    if ($results2.results.Count -ge 1) {
        $topScore = [math]::Round($results2.results[0].score, 3)
        Write-Host "✅ Query 2 PASSED - Found $($results2.results.Count) results" -ForegroundColor Green
        Write-Host "   Top result: $($results2.results[0].url) (score: $topScore)" -ForegroundColor Gray

        if ($topScore -lt 0.3) {
            Write-Host "⚠️  WARNING: Low relevance score $topScore (expected >0.4)" -ForegroundColor Yellow
        }
    }
    else {
        Write-Host "❌ Query 2 FAILED: No results returned" -ForegroundColor Red
        exit 1
    }

    Write-Host "`n🎉 All smoke tests PASSED!" -ForegroundColor Green
    Write-Host "================================" -ForegroundColor Cyan
    Write-Host "Summary:" -ForegroundColor Cyan
    Write-Host "  ✅ Health check OK" -ForegroundColor Green
    Write-Host "  ✅ Embeddings count: $($health.checks.embeddings_count)" -ForegroundColor Green
    Write-Host "  ✅ Semantic search functional" -ForegroundColor Green
    Write-Host "  ✅ RAG system ready for demo" -ForegroundColor Green

}
catch {
    Write-Host "`n❌ Smoke test FAILED!" -ForegroundColor Red
    Write-Host "Error: $_" -ForegroundColor Red
    exit 1
}
finally {
    # Cleanup port-forward
    Write-Host "`nCleaning up port-forward..." -ForegroundColor Gray
    Stop-Job -Job $portForwardJob
    Remove-Job -Job $portForwardJob
}
