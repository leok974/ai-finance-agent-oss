Param(
    [string]$Domain = "app.ledger-mind.org"
)

Write-Host "[edge-sanity.ps1] Internal running containers (prod + override):" -ForegroundColor Cyan
try {
    docker compose -f docker-compose.prod.yml -f docker-compose.prod.override.yml ps --status=running
} catch { Write-Warning "Could not list running containers" }

function Test-Edge($Path) {
    $url = "https://$Domain$Path"
    try {
        curl -sfI $url 2>$null | Out-Null
        if ($LASTEXITCODE -eq 0) { Write-Host "✅ $Path" } else { Write-Host "❌ $Path" }
    } catch { Write-Host "❌ $Path" }
}

Write-Host "[edge-sanity.ps1] Edge checks against $Domain" -ForegroundColor Cyan
Test-Edge "/_up"
Test-Edge "/ready"
Test-Edge "/api/healthz"
Test-Edge "/agui/ping"

# Chat probe with warming tolerance
function Invoke-ChatProbe {
    param([string]$BaseDomain)
    $base = "https://$BaseDomain"
    $body = '{"messages":[{"role":"user","content":"ping"}]}'
    try {
        $resp = curl -s -X POST "$base/agent/chat" -H "content-type: application/json" -k -d $body
    } catch { $resp = $null }
    if (-not $resp) { Write-Host "❌ /agent/chat (no response)"; return }
    try { $json = $resp | ConvertFrom-Json } catch { $json = $null }
    if ($json -and $json.error -eq 'model_warming') {
        Write-Host "🟡 /agent/chat warming (acceptable first call)"; Start-Sleep -Seconds 2
        try { $resp2 = curl -s -X POST "$base/agent/chat" -H "content-type: application/json" -k -d $body } catch { $resp2 = $null }
        if ($resp2) {
            try { $json2 = $resp2 | ConvertFrom-Json } catch { $json2 = $null }
            if ($json2 -and $json2.reply) { Write-Host "✅ /agent/chat OK after warm"; return }
        }
        Write-Host "❌ /agent/chat still warming / unexpected after retry"; return
    }
    if ($json -and $json.reply) { Write-Host "✅ /agent/chat" } else { Write-Host "❌ /agent/chat unexpected -> $resp" }
}

Invoke-ChatProbe $Domain

Write-Host "[edge-sanity.ps1] Complete." -ForegroundColor Green
