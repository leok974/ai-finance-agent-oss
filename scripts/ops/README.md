# Docker Watchdog Service

Automated monitoring and recovery for Docker Desktop on Windows.

## What it does

- **Monitors** Docker Desktop service (`com.docker.service`) every 1 minute
- **Detects** crashes or stopped state
- **Restarts** Docker service (or WSL + Desktop if service restart fails)
- **Recovers** production stack (`docker-compose.prod.yml`) automatically

## Files

- **`Watch-Docker.ps1`** - Main watchdog script that checks and restarts Docker
- **`Setup-WatchdogTask.ps1`** - One-time setup to register Windows Scheduled Task

## Installation

### 1. Copy scripts to C:\ops

Create the ops directory and copy the watchdog scripts:

```powershell
# Create directory
New-Item -ItemType Directory -Path "C:\ops" -Force

# Copy scripts from repo
Copy-Item "scripts\ops\Watch-Docker.ps1" -Destination "C:\ops\"
Copy-Item "scripts\ops\Setup-WatchdogTask.ps1" -Destination "C:\ops\"
```

### 2. Configure repository path (if needed)

If your repository is not at `C:\ai-finance-agent-oss-clean`, edit `C:\ops\Watch-Docker.ps1` line 40:

```powershell
Push-Location "C:\YOUR-REPO-PATH-HERE"
```

### 3. Run setup (Administrator required)

1. Right-click **PowerShell** → **Run as Administrator**
2. Navigate to `C:\ops`
3. Run the setup script:

```powershell
cd C:\ops
.\Setup-WatchdogTask.ps1
```

The script will:
- Remove any existing `WatchDockerService` task
- Create a new scheduled task running every 1 minute
- Run as SYSTEM with highest privileges
- Start automatically whether logged in or not

## Verification

### Check task status
```powershell
Get-ScheduledTask -TaskName "WatchDockerService"
```

### View last run time and result
```powershell
Get-ScheduledTaskInfo -TaskName "WatchDockerService"
```

### Manually trigger the watchdog now
```powershell
Start-ScheduledTask -TaskName "WatchDockerService"
```

### View task history in GUI
1. Open **Task Scheduler** (`taskschd.msc`)
2. Navigate to **Task Scheduler Library**
3. Find **WatchDockerService**
4. Check **History** tab (enable history if needed)

## Optional: Enable file logging

To log watchdog activity to a file, uncomment line 13 in `C:\ops\Watch-Docker.ps1`:

```powershell
Add-Content -Path "C:\ops\watchdog.log" -Value "[$timestamp] $Message"
```

Then view logs:
```powershell
Get-Content C:\ops\watchdog.log -Tail 50
```

Or monitor live:
```powershell
Get-Content C:\ops\watchdog.log -Wait -Tail 10
```

## Troubleshooting

### Task not running
- Check Task Scheduler for errors
- Verify execution policy: `Get-ExecutionPolicy` (should allow scripts)
- Run watchdog manually to test: `C:\ops\Watch-Docker.ps1`

### Docker not restarting
- Check Windows Event Viewer → Application logs
- Verify Docker Desktop path: `C:\Program Files\Docker\Docker\Docker Desktop.exe`
- Ensure WSL2 is installed and working: `wsl --status`

### Stack not coming up
- Verify compose file path in script
- Check Docker logs: `docker compose -f docker-compose.prod.yml logs`
- Manually test: `docker compose -f docker-compose.prod.yml up -d`

### Permission errors
- Ensure scheduled task runs as SYSTEM with highest privileges
- Verify `C:\ops\Watch-Docker.ps1` has correct execution policy

## Uninstallation

Remove the scheduled task:
```powershell
Unregister-ScheduledTask -TaskName "WatchDockerService" -Confirm:$false
```

Delete the scripts (optional):
```powershell
Remove-Item C:\ops\Watch-Docker.ps1 -Force
Remove-Item C:\ops\Setup-WatchdogTask.ps1 -Force
Remove-Item C:\ops\watchdog.log -Force -ErrorAction SilentlyContinue
```

## Architecture

```
┌─────────────────────────────────────────┐
│   Windows Scheduled Task (every 1 min)  │
└────────────┬────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────┐
│        Watch-Docker.ps1                 │
│  ┌──────────────────────────────────┐   │
│  │ 1. Check Docker service status   │   │
│  │ 2. If stopped → restart service  │   │
│  │ 3. If restart fails → WSL bounce │   │
│  │ 4. Verify docker context         │   │
│  │ 5. Bring up docker-compose stack │   │
│  └──────────────────────────────────┘   │
└─────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────┐
│     Docker Desktop + Production Stack   │
│   ┌────────┐  ┌────────┐  ┌────────┐   │
│   │Backend │  │  Web   │  │ Nginx  │   │
│   └────────┘  └────────┘  └────────┘   │
└─────────────────────────────────────────┘
```

## Configuration Options

### Adjust check frequency

Edit the `-RepetitionInterval` in `Setup-WatchdogTask.ps1`:

```powershell
# Check every 30 seconds
-RepetitionInterval (New-TimeSpan -Seconds 30)

# Check every 5 minutes
-RepetitionInterval (New-TimeSpan -Minutes 5)
```

### Add health check pings

Uncomment lines 55-61 in `Watch-Docker.ps1` to enable active health checks:

```powershell
# Optional quick health check (uncomment if needed)
Write-Log "[WatchDog] Docker service running, performing health check..."
try {
    docker ps | Out-Null
    Write-Log "[WatchDog] Docker health check passed."
} catch {
    Write-Log "[WatchDog] Docker health check failed, may need intervention."
}
```

### Customize restart delay

Adjust `Start-Sleep -Seconds 20` in line 32 if WSL/Desktop needs more startup time.

## Production Notes

- **Frequency**: Runs every 1 minute (adjustable)
- **User**: Runs as SYSTEM (no login required)
- **Priority**: Highest execution level (can restart services)
- **Timeout**: 5 minutes max execution time per run
- **Battery**: Continues running on battery power
- **Persistence**: Survives reboots and logouts

## Advanced: Alerting

For production alerting, add email/Slack notifications:

```powershell
# Add to Watch-Docker.ps1 after line 24 (service restart)
Send-MailMessage `
    -To "ops@example.com" `
    -From "watchdog@server.local" `
    -Subject "Docker Watchdog: Service Restarted" `
    -Body "Docker service was down and has been restarted at $(Get-Date)" `
    -SmtpServer "smtp.example.com"
```

Or use a webhook:
```powershell
$payload = @{ text = "Docker Watchdog: Service restarted at $(Get-Date)" } | ConvertTo-Json
Invoke-WebRequest -Uri "https://hooks.slack.com/services/YOUR/WEBHOOK/URL" `
    -Method Post `
    -Body $payload `
    -ContentType "application/json"
```
