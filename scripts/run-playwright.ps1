param(
  [string]$BaseUrl = $env:BASE_URL,
  [int]$Workers = [int]($env:PW_WORKERS ? $env:PW_WORKERS : 24),
  [switch]$Shard1,
  [switch]$Shard2
)
if (-not $BaseUrl) { $BaseUrl = "http://127.0.0.1:8080" }

$env:PW_SKIP_WS = "1"
$env:BASE_URL = $BaseUrl
$env:UV_THREADPOOL_SIZE = "32"

if ($Shard1) {
  pnpm -C apps/web exec playwright test --project=chromium --workers=$Workers --reporter=line --shard=1/2
} elseif ($Shard2) {
  pnpm -C apps/web exec playwright test --project=chromium --workers=$Workers --reporter=line --shard=2/2
} else {
  pnpm -C apps/web exec playwright test --project=chromium --workers=$Workers --retries=0 --reporter=line --fully-parallel
}
