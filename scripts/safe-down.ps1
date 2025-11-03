<#
.SYNOPSIS
  Safely bring down the ai-finance project using explicit project name.

.DESCRIPTION
  Runs docker compose down with explicit project name (-p ai-finance) to prevent
  accidental collisions with other Docker Compose projects. Also removes orphan
  containers that might be left from previous runs.

.PARAMETER RemoveVolumes
  If specified, also removes named volumes declared in the compose file.

.EXAMPLE
  pwsh ./scripts/safe-down.ps1

.EXAMPLE
  pwsh ./scripts/safe-down.ps1 -RemoveVolumes
#>
[CmdletBinding()]
param(
  [switch]$RemoveVolumes
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# Ensure we're in the repo root
$scriptDir = Split-Path -Parent $PSCommandPath
$repoRoot = Split-Path -Parent $scriptDir
Push-Location $repoRoot

try {
  Write-Host "🛑 Bringing down ai-finance project..." -ForegroundColor Cyan

  $dockerArgs = @(
    'compose',
    '-p', 'ai-finance',
    'down',
    '--remove-orphans'
  )

  if ($RemoveVolumes) {
    $dockerArgs += '--volumes'
    Write-Host "⚠️  Also removing volumes..." -ForegroundColor Yellow
  }

  & docker @dockerArgs

  if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ ai-finance project stopped successfully" -ForegroundColor Green
  } else {
    Write-Host "❌ Failed to stop ai-finance project" -ForegroundColor Red
    exit $LASTEXITCODE
  }
} finally {
  Pop-Location
}
