<#!
.SYNOPSIS
  Helper to trigger and monitor the ingest-smoke GitHub Actions workflow.

.DESCRIPTION
  Wraps `gh workflow run ingest-smoke` with convenience flags for:
    * Tolerant vs strict+large modes
    * Watching live logs / waiting for completion
    * Listing recent runs
    * Downloading artifacts (ingest-smoke.log or weekly logs)

  Requires: `gh` CLI authenticated (gh auth login) and repository context.

.PARAMETER Auth
  Switch: trigger strict happy-path auth test (adds -f auth_e2e=true).

.PARAMETER Large
  Switch: trigger large upload test (adds -f large=true).

.PARAMETER Watch
  Switch: stream run logs live (gh run watch) after dispatch.

.PARAMETER Wait
  Switch: poll until run completes (without streaming logs).

.PARAMETER List
  Switch: list the most recent runs and exit (does not trigger a run).

.PARAMETER Download
  Switch: after completion, download relevant artifact(s) into a local directory.

.PARAMETER ArtifactDir
  Directory to place downloaded artifacts (default: ./.ingest-smoke-artifacts)

.PARAMETER Web
  Open the run in a browser after dispatch.

.EXAMPLE
  # Tolerant smoke only
  ./scripts/trigger-ingest-smoke.ps1

.EXAMPLE
  # Strict happy-path + large, watch live
  ./scripts/trigger-ingest-smoke.ps1 -Auth -Large -Watch

.EXAMPLE
  # Just list recent runs
  ./scripts/trigger-ingest-smoke.ps1 -List

.NOTES
  If both -Watch and -Wait are specified, -Watch wins.
  Artifact names differ: tolerant failure => ingest-smoke.log; weekly => ingest-weekly-logs.
#>
param(
  [switch]$Auth,
  [switch]$Large,
  [switch]$Watch,
  [switch]$Wait,
  [switch]$List,
  [switch]$Download,
  [string]$ArtifactDir = ".\.ingest-smoke-artifacts",
  [switch]$Web
)

$ErrorActionPreference = 'Stop'

function Write-Info($msg) { Write-Host "[ingest-smoke] $msg" -ForegroundColor Cyan }
function Write-Warn($msg) { Write-Host "[ingest-smoke] WARN: $msg" -ForegroundColor Yellow }
function Write-Err($msg) { Write-Host "[ingest-smoke] ERROR: $msg" -ForegroundColor Red }

if ($List) {
  Write-Info "Listing recent runs (workflow: ingest-smoke)"
  gh run list --workflow ingest-smoke --limit 10
  exit 0
}

# Build gh workflow run command
$cmd = @('workflow','run','ingest-smoke')
if ($Auth)  { $cmd += @('-f','auth_e2e=true') }
if ($Large) { $cmd += @('-f','large=true') }

Write-Info ("Dispatching workflow: gh {0}" -f ($cmd -join ' '))
$dispatchOut = gh @cmd 2>&1
if ($LASTEXITCODE -ne 0) { Write-Err "Dispatch failed: $dispatchOut"; exit 1 }

# Give GitHub a moment to register the run
Start-Sleep -Seconds 3

# Determine the most recent run ID for this workflow
$runJson = gh run list --workflow ingest-smoke --limit 1 --json databaseId,status,conclusion,displayTitle,headBranch,createdAt | ConvertFrom-Json
if (-not $runJson) { Write-Err "Could not retrieve run after dispatch"; exit 2 }
$runId = $runJson[0].databaseId
Write-Info "Run ID: $runId (status=$($runJson[0].status))"

if ($Web) {
  Write-Info "Opening run in browser"
  gh run view $runId --web | Out-Null
}

if ($Watch) {
  Write-Info "Streaming logs (Ctrl+C to abort stream; run continues)"
  gh run watch $runId
  if ($Download) { Write-Info "Attempting artifact download after watch" }
}
elseif ($Wait) {
  Write-Info "Waiting for completion (polling)"
  while ($true) {
    $detail = gh run view $runId --json status,conclusion | ConvertFrom-Json
    if ($detail.status -eq 'completed') { break }
    Start-Sleep -Seconds 5
  }
  Write-Info "Completed with conclusion=$($detail.conclusion)"
}

if ($Download) {
  if (-not (Test-Path $ArtifactDir)) { New-Item -ItemType Directory -Path $ArtifactDir | Out-Null }
  Write-Info "Downloading artifacts to $ArtifactDir"
  gh run download $runId -D $ArtifactDir 2>$null || Write-Warn "No artifacts downloaded (maybe run succeeded without logs)"
  Write-Info "Contents:"; Get-ChildItem -Path $ArtifactDir -Recurse | ForEach-Object { " - " + $_.FullName }
}

if (-not ($Watch -or $Wait)) {
  Write-Info "Run dispatched. Use one of: gh run watch $runId | gh run view $runId --web | gh run view $runId --logs"
}
