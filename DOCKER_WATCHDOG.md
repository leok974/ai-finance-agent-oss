# Docker Watchdog Setup

Quick setup guide for the Docker service watchdog on Windows.

## What is this?

A Windows Scheduled Task that monitors Docker Desktop and automatically restarts it (+ your production stack) if it crashes.

## Quick Install

### 1. Copy scripts to C:\ops

```powershell
New-Item -ItemType Directory -Path "C:\ops" -Force
Copy-Item "scripts\ops\*" -Destination "C:\ops\" -Recurse
```

### 2. Run setup as Administrator

```powershell
# Right-click PowerShell → Run as Administrator
cd C:\ops
.\Setup-WatchdogTask.ps1
```

### 3. Verify

```powershell
Get-ScheduledTask -TaskName "WatchDockerService"
```

You should see:
- **TaskName**: WatchDockerService
- **State**: Ready
- **Next Run Time**: Within 1 minute

## What it does

Every 1 minute:
1. ✅ Check if Docker service is running
2. 🔄 If stopped → restart Docker service
3. 🔧 If restart fails → bounce WSL + Desktop
4. 🚀 Bring up production stack (`docker-compose.prod.yml`)

## Full Documentation

See [`scripts/ops/README.md`](scripts/ops/README.md) for:
- Detailed configuration options
- Troubleshooting guide
- Logging setup
- Alerting integration
- Uninstallation steps

## One-liner Install

```powershell
# From repository root (as Administrator)
New-Item -ItemType Directory -Path "C:\ops" -Force; Copy-Item "scripts\ops\*" -Destination "C:\ops\" -Recurse; Set-Location "C:\ops"; .\Setup-WatchdogTask.ps1
```

## Files Created

- `C:\ops\Watch-Docker.ps1` - Main watchdog script
- `C:\ops\Setup-WatchdogTask.ps1` - Task registration script
- `C:\ops\README.md` - Full documentation
- Scheduled Task: **WatchDockerService** (runs as SYSTEM)

## Why You Need This

Docker Desktop on Windows can crash due to:
- WSL2 kernel issues
- Memory pressure
- Windows updates
- Service conflicts

Without this watchdog:
- 🔴 Website goes down
- ⏰ Manual intervention required
- 📱 You get paged at 3 AM

With this watchdog:
- ✅ Automatic recovery within 1 minute
- 🛡️ Zero downtime for transient crashes
- 😴 Sleep peacefully
