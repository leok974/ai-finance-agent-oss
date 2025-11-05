# Start KMS Monitoring Stack
# This script starts Prometheus, AlertManager, and Grafana alongside your production stack

Write-Host "`n╔══════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║      KMS Monitoring Stack - Deployment Script           ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════════════════╝`n" -ForegroundColor Cyan

# Check if production stack is running
Write-Host "Checking production stack..." -ForegroundColor Cyan
$backend = docker ps --filter "name=ai-finance-backend-1" --format "{{.Names}}"
if (-not $backend) {
    Write-Host "❌ Production backend is not running!" -ForegroundColor Red
    Write-Host "   Please start it first with: docker-compose -f docker-compose.prod.yml up -d" -ForegroundColor Yellow
    exit 1
}
Write-Host "✅ Production stack is running" -ForegroundColor Green

# Check required directories
Write-Host "`nChecking configuration files..." -ForegroundColor Cyan
$requiredFiles = @(
    "ops\prometheus.yml",
    "ops\alertmanager\alertmanager.yml",
    "ops\alertmanager\kms.yml",
    "prometheus\rules\kms.yml",
    "ops\grafana\dashboards\kms-health.json"
)

$missing = @()
foreach ($file in $requiredFiles) {
    if (Test-Path $file) {
        Write-Host "  ✅ $file" -ForegroundColor Green
    } else {
        Write-Host "  ❌ $file - MISSING" -ForegroundColor Red
        $missing += $file
    }
}

if ($missing.Count -gt 0) {
    Write-Host "`n❌ Missing required files. Please create them first." -ForegroundColor Red
    exit 1
}

# Environment variables prompt
Write-Host "`n⚙️  Environment Configuration" -ForegroundColor Cyan
Write-Host "The following environment variables are recommended:" -ForegroundColor Yellow
Write-Host "  • SENDGRID_API_KEY    : For email alerts" -ForegroundColor White
Write-Host "  • SLACK_WEBHOOK_URL   : For Slack notifications" -ForegroundColor White
Write-Host "  • GRAFANA_ADMIN_PASSWORD : Grafana admin password (default: admin)" -ForegroundColor White

$envVars = @{}
if ($env:SENDGRID_API_KEY) {
    Write-Host "`n✅ SENDGRID_API_KEY is set" -ForegroundColor Green
    $envVars['SENDGRID_API_KEY'] = $env:SENDGRID_API_KEY
} else {
    Write-Host "`n⚠️  SENDGRID_API_KEY not set - email alerts will not work" -ForegroundColor Yellow
}

if ($env:SLACK_WEBHOOK_URL) {
    Write-Host "✅ SLACK_WEBHOOK_URL is set" -ForegroundColor Green
    $envVars['SLACK_WEBHOOK_URL'] = $env:SLACK_WEBHOOK_URL
} else {
    Write-Host "⚠️  SLACK_WEBHOOK_URL not set - Slack alerts will not work" -ForegroundColor Yellow
}

# Start monitoring stack
Write-Host "`n🚀 Starting monitoring stack..." -ForegroundColor Cyan
try {
    Push-Location ops
    docker-compose -f docker-compose.monitoring.yml up -d
    Pop-Location

    Write-Host "`n✅ Monitoring stack started successfully!" -ForegroundColor Green
} catch {
    Write-Host "`n❌ Failed to start monitoring stack: $_" -ForegroundColor Red
    Pop-Location
    exit 1
}

# Wait for services to be healthy
Write-Host "`nWaiting for services to be healthy..." -ForegroundColor Cyan
Start-Sleep -Seconds 10

# Check service status
Write-Host "`nService Status:" -ForegroundColor Cyan
$services = @("prometheus", "alertmanager", "grafana")
foreach ($service in $services) {
    $status = docker ps --filter "name=$service" --format "{{.Status}}"
    if ($status -match "healthy|Up") {
        Write-Host "  ✅ $service : $status" -ForegroundColor Green
    } else {
        Write-Host "  ⚠️  $service : $status" -ForegroundColor Yellow
    }
}

# Display access URLs
Write-Host "`n╔══════════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║           Monitoring Stack is Ready!                     ║" -ForegroundColor Green
Write-Host "╚══════════════════════════════════════════════════════════╝`n" -ForegroundColor Green

Write-Host "Access URLs:" -ForegroundColor Cyan
Write-Host "  📊 Prometheus     : http://localhost:9090" -ForegroundColor White
Write-Host "  🔔 AlertManager   : http://localhost:9093" -ForegroundColor White
Write-Host "  📈 Grafana        : http://localhost:3000" -ForegroundColor White
Write-Host "                      (default login: admin/admin)" -ForegroundColor Gray

Write-Host "`nNext Steps:" -ForegroundColor Cyan
Write-Host "  1. Import Grafana dashboard:" -ForegroundColor White
Write-Host "     • Go to http://localhost:3000" -ForegroundColor Gray
Write-Host "     • Settings → API Keys → Create API key" -ForegroundColor Gray
Write-Host "     • Run import command from docs\KMS_VERIFICATION_GUIDE.md" -ForegroundColor Gray
Write-Host "`n  2. Test alert routing:" -ForegroundColor White
Write-Host "     • See section 3 of docs\KMS_VERIFICATION_GUIDE.md" -ForegroundColor Gray
Write-Host "`n  3. Verify Prometheus rules:" -ForegroundColor White
Write-Host "     • docker exec prometheus promtool check rules /etc/prometheus/rules/kms.yml" -ForegroundColor Gray
Write-Host "`n  4. View metrics:" -ForegroundColor White
Write-Host "     • Go to Prometheus → Status → Targets" -ForegroundColor Gray
Write-Host "     • Verify 'ai-finance-backend' target is UP" -ForegroundColor Gray

Write-Host "`n📖 Full verification guide: docs\KMS_VERIFICATION_GUIDE.md`n" -ForegroundColor Cyan
