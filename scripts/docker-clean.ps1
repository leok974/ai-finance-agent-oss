<#
.SYNOPSIS
  Remove Docker containers/images/volumes/networks not belonging to protected projects.

.DESCRIPTION
  By default performs a dry run. Use -Prune to actually remove resources.
  Protected projects: infra, ai-finance, ai-finance-e2e, portfolio

.PARAMETER Prune
  Actually execute the cleanup. Without this flag, only shows what would be removed.

.EXAMPLE
  pwsh ./scripts/docker-clean.ps1          # Dry run
  pwsh ./scripts/docker-clean.ps1 -Prune   # Execute cleanup
#>
Param([switch]$Prune)

$ErrorActionPreference = 'Stop'
$keep = @('infra', 'ai-finance', 'ai-finance-e2e', 'portfolio')
$ctx = $env:DOCKER_CONTEXT
if (-not $ctx) { $env:DOCKER_CONTEXT = 'desktop-linux' }

function Test-KeepProject($proj) {
  $keep -contains $proj
}

Write-Host "🧹 Docker Cleanup Utility" -ForegroundColor Cyan
Write-Host "Protected projects: $($keep -join ', ')" -ForegroundColor Gray
Write-Host ""

# ========== Containers ==========
Write-Host "📦 Checking containers..." -ForegroundColor Cyan
$all = docker ps -a --format "{{.ID}}`t{{.Names}}`t{{.Label `"com.docker.compose.project`"}}" 2>$null
$toRm = @()

foreach ($line in $all) {
  if (-not $line) { continue }
  $parts = $line -split "`t"
  if ($parts.Count -lt 3) { continue }
  $id, $name, $proj = $parts[0], $parts[1], $parts[2]
  if (-not (Test-KeepProject $proj)) {
    $toRm += @{Id=$id; Name=$name; Proj=$proj}
  }
}

if ($toRm.Count -gt 0) {
  Write-Host "  Containers to remove:" -ForegroundColor Yellow
  $toRm | ForEach-Object {
    Write-Host "    $($_.Id.Substring(0,12))  $($_.Name)  [$($_.Proj)]" -ForegroundColor Gray
  }
  if ($Prune) {
    $toRm | ForEach-Object { docker rm -f $_.Id 2>$null | Out-Null }
    Write-Host "  ✅ Removed $($toRm.Count) containers" -ForegroundColor Green
  }
} else {
  Write-Host "  ✅ No extra containers" -ForegroundColor Green
}

# ========== Dangling Images ==========
Write-Host ""
Write-Host "🖼️  Checking dangling images..." -ForegroundColor Cyan
$dang = docker images -f "dangling=true" -q 2>$null | Sort-Object -Unique

if ($dang -and $dang.Count -gt 0) {
  Write-Host "  Dangling images: $($dang.Count)" -ForegroundColor Yellow
  if ($Prune) {
    docker rmi -f $dang 2>$null | Out-Null
    Write-Host "  ✅ Removed $($dang.Count) images" -ForegroundColor Green
  }
} else {
  Write-Host "  ✅ No dangling images" -ForegroundColor Green
}

# ========== Volumes ==========
Write-Host ""
Write-Host "💾 Checking volumes..." -ForegroundColor Cyan
$vols = docker volume ls -q 2>$null
$vRm = $vols | Where-Object {
  $name = $_
  # Keep volumes whose name contains any of the keep projects
  -not ($keep | Where-Object { $name -like "*$_*" })
}

if ($vRm -and $vRm.Count -gt 0) {
  Write-Host "  Volumes to consider removing:" -ForegroundColor Yellow
  $vRm | ForEach-Object { Write-Host "    $_" -ForegroundColor Gray }
  if ($Prune) {
    docker volume rm $vRm 2>$null | Out-Null
    Write-Host "  ✅ Removed $($vRm.Count) volumes" -ForegroundColor Green
  }
} else {
  Write-Host "  ✅ No extra volumes" -ForegroundColor Green
}

# ========== Networks ==========
Write-Host ""
Write-Host "🌐 Checking networks..." -ForegroundColor Cyan
$nets = docker network ls --format "{{.ID}}`t{{.Name}}" 2>$null
$nRm = @()

foreach ($n in $nets) {
  if (-not $n) { continue }
  $id, $name = $n -split "`t"
  # Skip system networks and infra_net
  if ($name -in @('bridge', 'host', 'none', 'infra_net')) { continue }
  # Skip networks containing keep project names
  if ($keep | Where-Object { $name -like "*$_*" }) { continue }
  $nRm += $name
}

if ($nRm.Count -gt 0) {
  Write-Host "  Networks to consider removing:" -ForegroundColor Yellow
  $nRm | ForEach-Object { Write-Host "    $_" -ForegroundColor Gray }
  if ($Prune) {
    docker network rm $nRm 2>$null | Out-Null
    Write-Host "  ✅ Removed $($nRm.Count) networks" -ForegroundColor Green
  }
} else {
  Write-Host "  ✅ No extra networks" -ForegroundColor Green
}

# ========== Summary ==========
Write-Host ""
if (-not $Prune) {
  Write-Host "(Dry run) To execute cleanup: pwsh .\scripts\docker-clean.ps1 -Prune" -ForegroundColor Yellow
} else {
  Write-Host "✅ Cleanup complete!" -ForegroundColor Green
}
