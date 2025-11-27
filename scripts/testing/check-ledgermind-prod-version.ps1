# LedgerMind Production Version Checker
# PowerShell version of check-ledgermind-prod-version.sh

param(
    [string]$Url = "https://app.ledger-mind.org/version.json"
)

$ErrorActionPreference = "Stop"

Write-Host ">>> Checking LedgerMind prod version at $Url" -ForegroundColor Cyan

try {
    $remoteJson = Invoke-RestMethod -Uri $Url -Method Get -ErrorAction Stop
} catch {
    Write-Host "!! Failed to fetch version.json: $_" -ForegroundColor Red
    exit 1
}

$remoteBranch = $remoteJson.branch ?? "unknown"
$remoteCommit = $remoteJson.commit ?? "unknown"

$localBranch = git rev-parse --abbrev-ref HEAD
$localCommit = git rev-parse --short=8 HEAD

Write-Host
Write-Host "Remote: branch=$remoteBranch commit=$remoteCommit" -ForegroundColor Yellow
Write-Host "Local : branch=$localBranch commit=$localCommit" -ForegroundColor Yellow
Write-Host

if ($remoteBranch -eq $localBranch -and $remoteCommit -eq $localCommit) {
    Write-Host "✅ Prod matches local HEAD. Safe to debug app behavior." -ForegroundColor Green
    exit 0
} else {
    Write-Host "⚠️  Prod build is out of sync with local HEAD." -ForegroundColor Red
    Write-Host "    Deploy nginx first: scripts\deploy-ledgermind-nginx.ps1" -ForegroundColor Yellow
    exit 1
}
