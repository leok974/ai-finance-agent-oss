# Setup-WatchdogTask.ps1
# Run this script in an ELEVATED PowerShell to register the watchdog scheduled task
# Usage: Right-click PowerShell → Run as Administrator, then run this script

$ErrorActionPreference = "Stop"

Write-Host "Setting up Docker Watchdog Scheduled Task..." -ForegroundColor Cyan

# Check if running as Administrator
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host "ERROR: This script must be run as Administrator." -ForegroundColor Red
    Write-Host "Right-click PowerShell and select 'Run as Administrator', then run this script again." -ForegroundColor Yellow
    exit 1
}

# Remove existing task if present
try {
    Unregister-ScheduledTask -TaskName "WatchDockerService" -Confirm:$false -ErrorAction SilentlyContinue
    Write-Host "Removed existing WatchDockerService task (if any)." -ForegroundColor Yellow
} catch {
    # No existing task, continue
}

# Create scheduled task action (run the watchdog script)
$action = New-ScheduledTaskAction `
    -Execute "powershell.exe" `
    -Argument "-NoProfile -ExecutionPolicy Bypass -File `"C:\ops\Watch-Docker.ps1`""

# Create trigger (run every 1 minute, starting 1 minute from now, forever)
$trigger = New-ScheduledTaskTrigger `
    -Once `
    -At (Get-Date).AddMinutes(1) `
    -RepetitionInterval (New-TimeSpan -Minutes 1) `
    -RepetitionDuration ([TimeSpan]::MaxValue)

# Create task settings (run whether user is logged in or not, don't stop on idle, etc.)
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -DontStopOnIdleEnd `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 5)

# Register the task (run as SYSTEM with highest privileges)
Register-ScheduledTask `
    -TaskName "WatchDockerService" `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -RunLevel Highest `
    -User "SYSTEM" `
    -Description "Monitors Docker service and restarts it + LedgerMind stack if it crashes"

Write-Host "`nScheduled Task 'WatchDockerService' created successfully!" -ForegroundColor Green
Write-Host "  - Runs every 1 minute" -ForegroundColor Cyan
Write-Host "  - Checks Docker service health" -ForegroundColor Cyan
Write-Host "  - Restarts service + production stack if down" -ForegroundColor Cyan
Write-Host "  - Logs to console (optional: enable file logging in Watch-Docker.ps1)" -ForegroundColor Cyan

Write-Host "`nTo view task status:" -ForegroundColor Yellow
Write-Host "  Get-ScheduledTask -TaskName 'WatchDockerService'" -ForegroundColor Gray

Write-Host "`nTo view task history:" -ForegroundColor Yellow
Write-Host "  Get-ScheduledTaskInfo -TaskName 'WatchDockerService'" -ForegroundColor Gray

Write-Host "`nTo manually run the task now:" -ForegroundColor Yellow
Write-Host "  Start-ScheduledTask -TaskName 'WatchDockerService'" -ForegroundColor Gray

Write-Host "`nTo remove the task:" -ForegroundColor Yellow
Write-Host "  Unregister-ScheduledTask -TaskName 'WatchDockerService' -Confirm:`$false" -ForegroundColor Gray

Write-Host "`nWatchdog is now active!" -ForegroundColor Green
