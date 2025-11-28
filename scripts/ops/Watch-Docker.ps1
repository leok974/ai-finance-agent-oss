# Watch-Docker.ps1
# Watchdog script to monitor and restart Docker service + LedgerMind stack
# Run as Scheduled Task every 1 minute

$ErrorActionPreference = "SilentlyContinue"

# Logging helper
function Write-Log {
    param([string]$Message)
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Write-Host "[$timestamp] $Message"
    # Optional: append to log file
    # Add-Content -Path "C:\ops\watchdog.log" -Value "[$timestamp] $Message"
}

# 1. Check Docker service
$svc = Get-Service -Name "com.docker.service" -ErrorAction SilentlyContinue

if (-not $svc -or $svc.Status -ne "Running") {
    Write-Log "[WatchDog] Docker service not running. Restarting..."

    try {
        Restart-Service com.docker.service -Force -ErrorAction Stop
        Write-Log "[WatchDog] Docker service restarted successfully."
    } catch {
        Write-Log "[WatchDog] Failed to restart Docker service directly, bouncing WSL + Desktop..."
        wsl --shutdown
        Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"
        Start-Sleep -Seconds 20
        Write-Log "[WatchDog] WSL shutdown + Docker Desktop restarted."
    }

    # Optional: warm up context & stack
    try {
        docker --context desktop-linux info | Out-Null
        Write-Log "[WatchDog] Docker context verified."
    } catch {
        Write-Log "[WatchDog] docker info failed, will try again on next run."
    }

    # Bring your stack back up (adjust path/filename)
    try {
        Push-Location "C:\ai-finance-agent-oss-clean"
        Write-Log "[WatchDog] Bringing production stack up..."
        docker compose -f docker-compose.prod.yml up -d
        Pop-Location
        Write-Log "[WatchDog] Production stack restarted."
    } catch {
        Write-Log "[WatchDog] Failed to bring stack up, check logs: $_"
    }
} else {
    # Optional quick health check (uncomment if needed)
    # Write-Log "[WatchDog] Docker service running, performing health check..."
    # try {
    #     docker ps | Out-Null
    #     Write-Log "[WatchDog] Docker health check passed."
    # } catch {
    #     Write-Log "[WatchDog] Docker health check failed, may need intervention."
    # }
}
