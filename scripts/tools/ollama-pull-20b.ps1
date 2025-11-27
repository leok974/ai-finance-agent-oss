$ErrorActionPreference = "Stop"

# Try to resolve the Ollama container ID from the default compose, then fall back to prod compose.
$cid = $null
try {
    $cid = (docker compose ps -q ollama).Trim()
} catch { }

if (-not $cid) {
    try {
        $cid = (docker compose -f "$PSScriptRoot/../docker-compose.prod.yml" ps -q ollama).Trim()
    } catch { }
}

if (-not $cid) {
    throw "Ollama container not running. Start it with: docker compose -f ./docker-compose.prod.yml up -d ollama"
}

Write-Host "Pulling model gpt-oss:20b inside container $cid ..."
docker exec $cid ollama pull gpt-oss:20b
Write-Host "Installed models:"
docker exec $cid ollama list
