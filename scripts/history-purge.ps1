param(
  [string]$ExtraPathsFile = ""
)
# Requires: python -m pip install git-filter-repo
$ErrorActionPreference = "Stop"
$root = (Resolve-Path ".").Path
Write-Host "Purging history in MIRROR clone..."
$remote = (git remote get-url origin)
$mirrorDir = Join-Path (Split-Path $root) "repo-clean.git"
if (Test-Path $mirrorDir) { Remove-Item -Recurse -Force $mirrorDir }
git clone --mirror $remote $mirrorDir
Set-Location $mirrorDir

# Base paths to purge everywhere
$base = @(
  ".env", ".env.*",
  "*.pem", "*.key", "*.pfx", "serviceAccount*.json",
  "*.sqlite", "*.db",
  "node_modules", "*/node_modules/*",
  "dist", "build", ".vite", ".turbo",
  "__pycache__", ".pytest_cache", "*.log"
)

# Build args
$filterArgs = @()
foreach ($p in $base) { $filterArgs += @("--path", $p) }
if ($ExtraPathsFile -and (Test-Path $ExtraPathsFile)) {
  Get-Content $ExtraPathsFile | ForEach-Object {
  if ($_.Trim()) { $filterArgs += @("--path", $_.Trim()) }
  }
}
$filterArgs += "--invert-paths"

python -m git_filter_repo @filterArgs

git push --force --all
git push --force --tags
Write-Host "Done. Tell future you: re-clone the repo."
