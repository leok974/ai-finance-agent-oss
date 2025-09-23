$ErrorActionPreference = "Stop"

$cid = (docker compose ps -q ollama).Trim()
if (-not $cid) {
    throw "Ollama container not running. Run: docker compose up -d ollama"
}

docker exec $cid ollama pull gpt-oss:20b
docker exec $cid ollama list
