# Docker Cleanup Commands

These commands help free up disk space from Docker builds and test runs.

## Safe Cleanup (Recommended)

```powershell
# Remove dangling images (untagged, not used by any container)
docker image prune -f

# Remove dangling build cache
docker builder prune -f

# Check disk usage
docker system df
```

## Aggressive Cleanup (Use with caution)

⚠️ **Warning**: These remove all unused resources. Don't run during production deployments.

```powershell
# Remove all stopped containers
docker container prune -f

# Remove all unused images (not just dangling)
docker image prune -a -f

# Remove all unused volumes
docker volume prune -f

# Remove all unused networks
docker network prune -f

# Nuclear option: remove everything not currently in use
docker system prune -a --volumes -f
```

## Check What Would Be Removed

```powershell
# See what images would be removed
docker image prune --dry-run

# See what containers would be removed
docker container prune --dry-run

# See system-wide cleanup preview
docker system prune --dry-run
```

## LedgerMind-Specific Cleanup

```powershell
# Remove old LedgerMind images (keep only latest)
docker images | Select-String "ledgermind" | ForEach-Object {
  $parts = $_ -split '\s+'
  if ($parts[1] -notmatch "main-99f1638a") {
    docker rmi "$($parts[0]):$($parts[1])"
  }
}
```

## Automated Cleanup Script

For regular maintenance, create `scripts/clean-docker.ps1`:

```powershell
#!/usr/bin/env pwsh
# Clean Docker artifacts safely

Write-Host "[docker-clean] Removing dangling images..." -ForegroundColor Cyan
docker image prune -f

Write-Host "[docker-clean] Removing dangling build cache..." -ForegroundColor Cyan
docker builder prune -f

Write-Host "[docker-clean] Current disk usage:" -ForegroundColor Green
docker system df
```

Then run:

```powershell
# From repo root
.\scripts\clean-docker.ps1
```

## Monitoring

```powershell
# See all images with size
docker images --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}"

# See disk usage breakdown
docker system df -v

# See largest images
docker images --format "{{.Size}}\t{{.Repository}}:{{.Tag}}" | Sort-Object -Descending | Select-Object -First 10
```
