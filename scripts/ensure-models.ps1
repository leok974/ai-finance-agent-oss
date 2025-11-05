<#
.SYNOPSIS
  Discover required Ollama models and pull any missing into the infra Ollama container.

.PARAMETER Extra
  Additional model names to pull beyond what's auto-discovered.

.EXAMPLE
  pwsh ./scripts/ensure-models.ps1

.EXAMPLE
  pwsh ./scripts/ensure-models.ps1 -Extra "llama3.2:3b","codellama:7b"
#>
Param([string[]]$Extra=@())

$ErrorActionPreference = 'Stop'
$proj = 'infra'   # shared project name, adjust if different
$ctx = $env:DOCKER_CONTEXT
if (-not $ctx) { $env:DOCKER_CONTEXT = 'desktop-linux' }

function Get-OllamaContainer {
  docker ps --filter "label=com.docker.compose.project=$proj" --filter "label=com.docker.compose.service=ollama" -q
}

# 1) Discover models by scanning env & code
Write-Host "🔍 Discovering required Ollama models..." -ForegroundColor Cyan
$candidates = @()

# Read repo-specific model manifest if it exists
$manifestPath = Join-Path $PSScriptRoot "..\models.ai-finance.txt"
if (Test-Path $manifestPath) {
  Write-Host "📄 Reading models.ai-finance.txt..." -ForegroundColor Gray
  $manifestModels = Get-Content $manifestPath -ErrorAction SilentlyContinue |
    Where-Object { $_ -and $_ -notmatch '^\s*#' -and $_.Trim() -ne '' } |
    ForEach-Object { $_.Trim() }
  $candidates += $manifestModels
  Write-Host "   Found $($manifestModels.Count) model(s) in manifest" -ForegroundColor Gray
}

# Scan .env files
$envFiles = Get-ChildItem -Path . -Recurse -Include ".env","*.env" -ErrorAction SilentlyContinue
foreach ($f in $envFiles) {
  $lines = Get-Content $f.FullName -ErrorAction SilentlyContinue
  if ($lines) {
    $matchedLines = $lines | Where-Object { $_ -match 'OLLAMA_(MODEL|MODELS|EMBED|CHAT)_?\s*=\s*(.+)$' }
    if ($matchedLines) {
      $candidates += ($matchedLines | ForEach-Object {
        ($_ -split '=',2)[1].Trim() -split '[ ,;]+'
      })
    }
  }
}

# Scan code files for model references
$codeHits = Get-ChildItem -Recurse -Include *.ts,*.tsx,*.js,*.py,*.yml,*.yaml -ErrorAction SilentlyContinue |
  Select-String -Pattern 'model["\'']\s*:\s*["'']([a-z0-9][a-z0-9._-]*:[a-z0-9][a-z0-9._-]*)' -AllMatches -ErrorAction SilentlyContinue

foreach ($m in $codeHits) {
  foreach ($am in $m.Matches) {
    if ($am.Groups[1].Value) {
      $candidates += $am.Groups[1].Value
    }
  }
}

# Combine with Extra and deduplicate
$models = ($candidates + $Extra) |
  Where-Object { $_ } |
  ForEach-Object { $_.Trim() } |
  Where-Object { $_ -ne '' } |
  Sort-Object -Unique

if (-not $models) {
  Write-Host "⚠️  No models detected. Set REQUIRED_OLLAMA_MODELS or pass -Extra" -ForegroundColor Yellow
  exit 0
}

Write-Host "📋 Detected models: $($models -join ', ')" -ForegroundColor Cyan

# 2) Pull missing models inside the container
$cid = Get-OllamaContainer
if (-not $cid) {
  throw "❌ Ollama container from project '$proj' not found. Start infra first."
}

Write-Host "🐳 Checking models in container $cid..." -ForegroundColor Cyan
$existingJson = docker exec $cid curl -s http://localhost:11434/api/tags 2>$null | Out-String
$existing = @()
if ($existingJson) {
  try {
    $existing = ($existingJson | ConvertFrom-Json).models.name
  } catch {
    Write-Host "⚠️  Could not parse existing models" -ForegroundColor Yellow
  }
}

# Track results for summary
$results = @{
  AlreadyPresent = @()
  Pulled = @()
  Failed = @()
}

foreach ($m in $models) {
  if ($existing -contains $m) {
    Write-Host "✅ $m already present" -ForegroundColor Green
    $results.AlreadyPresent += $m
    continue
  }
  Write-Host "⬇️  Pulling $m..." -ForegroundColor Cyan
  docker exec -it $cid ollama pull $m
  if ($LASTEXITCODE -ne 0) {
    Write-Host "⚠️  Failed to pull $m" -ForegroundColor Yellow
    $results.Failed += $m
  } else {
    $results.Pulled += $m
  }
}

# Summary
Write-Host ""
Write-Host "📊 Summary:" -ForegroundColor Cyan
Write-Host "   ✅ Already present: $($results.AlreadyPresent.Count)" -ForegroundColor Green
Write-Host "   ⬇️  Pulled: $($results.Pulled.Count)" -ForegroundColor Cyan
if ($results.Failed.Count -gt 0) {
  Write-Host "   ⚠️  Failed: $($results.Failed.Count) - $($results.Failed -join ', ')" -ForegroundColor Yellow
}
Write-Host ""
Write-Host "✅ Done." -ForegroundColor Green
