# dbt.ps1 - PowerShell wrapper for dbt commands using Docker
# Run from warehouse/ directory
# Example: .\dbt.ps1 debug

param(
    [Parameter(Mandatory=$true, Position=0)]
    [ValidateSet('help', 'debug', 'deps', 'build', 'staging', 'marts', 'test', 'docs', 'clean')]
    [string]$Command
)

$NETWORK = "shared-ollama"
$IMAGE = "ghcr.io/dbt-labs/dbt-postgres:1.7.0"
$WORK_DIR = $PWD.Path
$DOCKER_RUN = "docker run --rm -it --network $NETWORK -v `"${WORK_DIR}:/work`" -w /work $IMAGE"

function Show-Help {
    Write-Host "LedgerMind dbt Warehouse Commands" -ForegroundColor Cyan
    Write-Host "==================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Usage: .\dbt.ps1 <command>"
    Write-Host ""
    Write-Host "Commands:"
    Write-Host "  help      - Show this help message"
    Write-Host "  debug     - Test database connection"
    Write-Host "  deps      - Install dbt packages"
    Write-Host "  build     - Build all models (staging + marts)"
    Write-Host "  staging   - Build staging models only"
    Write-Host "  marts     - Build marts models only"
    Write-Host "  test      - Run dbt tests"
    Write-Host "  docs      - Generate dbt documentation"
    Write-Host "  clean     - Remove target/ and logs/ directories"
    Write-Host ""
    Write-Host "Prerequisites:" -ForegroundColor Yellow
    Write-Host "  - Docker running"
    Write-Host "  - shared-ollama network exists"
    Write-Host "  - postgres container running"
    Write-Host ""
    Write-Host "Examples:"
    Write-Host "  .\dbt.ps1 debug      # Test connection"
    Write-Host "  .\dbt.ps1 build      # Build all models"
    Write-Host "  .\dbt.ps1 staging    # Build staging only"
}

switch ($Command) {
    'help' {
        Show-Help
    }
    'debug' {
        Write-Host "Testing dbt connection..." -ForegroundColor Green
        Invoke-Expression "$DOCKER_RUN debug --profiles-dir ."
    }
    'deps' {
        Write-Host "Installing dbt packages..." -ForegroundColor Green
        Invoke-Expression "$DOCKER_RUN deps --profiles-dir ."
    }
    'staging' {
        Write-Host "Building staging models..." -ForegroundColor Green
        Invoke-Expression "$DOCKER_RUN run --profiles-dir . --select staging"
    }
    'marts' {
        Write-Host "Building marts models..." -ForegroundColor Green
        Invoke-Expression "$DOCKER_RUN run --profiles-dir . --select marts"
    }
    'build' {
        Write-Host "Building all models..." -ForegroundColor Green
        Invoke-Expression "$DOCKER_RUN build --profiles-dir ."
    }
    'test' {
        Write-Host "Running tests..." -ForegroundColor Green
        Invoke-Expression "$DOCKER_RUN test --profiles-dir ."
    }
    'docs' {
        Write-Host "Generating dbt documentation..." -ForegroundColor Green
        Invoke-Expression "$DOCKER_RUN docs generate --profiles-dir ."
    }
    'clean' {
        Write-Host "Cleaning target and logs directories..." -ForegroundColor Green
        if (Test-Path "target") { Remove-Item -Recurse -Force "target" }
        if (Test-Path "logs") { Remove-Item -Recurse -Force "logs" }
        Write-Host "Clean complete!" -ForegroundColor Green
    }
}
