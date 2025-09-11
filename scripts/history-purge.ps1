param([string]$ExtraPathsFile = "")
$ErrorActionPreference = "Stop"
if (-not (python - << 'PY' 2>$null
import sys, importlib.util
sys.exit(0 if importlib.util.find_spec("git_filter_repo") else 1)
PY
)) { python -m pip install git-filter-repo }

$root = (Resolve-Path ".").Path
$remote = (git remote get-url origin)
$mirrorDir = Join-Path (Split-Path $root) "repo-clean.git"
if (Test-Path $mirrorDir) { Remove-Item -Recurse -Force $mirrorDir }
git clone --mirror $remote $mirrorDir
Set-Location $mirrorDir

$base = @(
  ".env", ".env.*",
  "*.pem", "*.key", "*.pfx", "serviceAccount*.json",
  "*.sqlite", "*.db",
  "node_modules", "*/node_modules/*",
  "dist", "build", ".vite", ".turbo",
  "__pycache__", ".pytest_cache", "*.log"
)
$args = @()
foreach ($p in $base) { $args += @("--path", $p) }
if ($ExtraPathsFile -and (Test-Path $ExtraPathsFile)) {
  Get-Content $ExtraPathsFile | ForEach-Object {
    if ($_.Trim()) { $args += @("--path", $_.Trim()) }
  }
}
$args += "--invert-paths"

python -m git_filter_repo @args

git push --force --all
git push --force --tags
Write-Host "History purged and force-pushed. Re-clone this repo for a clean checkout."
