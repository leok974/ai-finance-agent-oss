<#
.SYNOPSIS
    Setup script for GCP Cloud KMS Audit Logging (PowerShell version)

.DESCRIPTION
    Configures comprehensive audit logging for KMS operations:
    1. Enables KMS API (if not already enabled)
    2. Configures Data Access audit logs (ADMIN_READ, DATA_READ, DATA_WRITE)
    3. (Optional) Creates BigQuery dataset and log sink for analysis
    4. (Optional) Creates GCS bucket and log sink for long-term storage

.PARAMETER ProjectId
    GCP project ID (default: ledgermind-03445-3l)

.PARAMETER SetupBigQuery
    Set up BigQuery log sink (switch parameter)

.PARAMETER SetupGCS
    Set up GCS log sink (switch parameter)

.EXAMPLE
    .\setup-kms-audit-logging.ps1

.EXAMPLE
    .\setup-kms-audit-logging.ps1 -SetupBigQuery -SetupGCS
#>

param(
    [string]$ProjectId = "ledgermind-03445-3l",
    [string]$Region = "us-east1",
    [string]$BQDataset = "kms_audit",
    [string]$GCSBucket = "ledgermind-kms-audit-logs",
    [switch]$SetupBigQuery,
    [switch]$SetupGCS
)

$ErrorActionPreference = "Stop"

function Write-Info {
    param([string]$Message)
    Write-Host "[INFO] $Message" -ForegroundColor Green
}

function Write-Warn {
    param([string]$Message)
    Write-Host "[WARN] $Message" -ForegroundColor Yellow
}

function Write-Err {
    param([string]$Message)
    Write-Host "[ERROR] $Message" -ForegroundColor Red
}

function Test-Prerequisites {
    Write-Info "Checking prerequisites..."

    # Check gcloud
    if (-not (Get-Command gcloud -ErrorAction SilentlyContinue)) {
        Write-Err "gcloud CLI not found. Please install: https://cloud.google.com/sdk/install"
        exit 1
    }

    # Check authentication
    $account = gcloud auth list --filter=status:ACTIVE --format="value(account)" 2>$null
    if (-not $account) {
        Write-Err "Not authenticated with gcloud. Run: gcloud auth login"
        exit 1
    }

    # Set project
    gcloud config set project $ProjectId --quiet 2>$null
    Write-Info "✅ Prerequisites OK (project: $ProjectId)"
}

function Enable-KMSApi {
    Write-Info "Enabling Cloud KMS API..."
    gcloud services enable cloudkms.googleapis.com --project=$ProjectId --quiet 2>$null
    Write-Info "✅ Cloud KMS API enabled"
}

function Set-AuditLogs {
    Write-Info "Configuring KMS Data Access audit logs..."

    try {
        gcloud beta logging settings update `
            --project=$ProjectId `
            --service=cloudkms.googleapis.com `
            --log-types=ADMIN_READ,DATA_READ,DATA_WRITE `
            --quiet 2>$null

        Write-Info "✅ Audit logs configured for Cloud KMS"
        Write-Info "   - ADMIN_READ: Administrative operations (create/delete keys)"
        Write-Info "   - DATA_READ: Key read operations (get key, list keys)"
        Write-Info "   - DATA_WRITE: Cryptographic operations (encrypt/decrypt)"
    }
    catch {
        Write-Err "Failed to configure audit logs via gcloud beta"
        Write-Warn "Try configuring manually via GCP Console: IAM → Audit Logs → Cloud KMS API"
        throw
    }
}

function Setup-BigQuerySink {
    Write-Info "Setting up BigQuery log sink..."

    # Check if bq command exists
    if (-not (Get-Command bq -ErrorAction SilentlyContinue)) {
        Write-Warn "bq command not found. Skipping BigQuery setup."
        Write-Warn "Install with: gcloud components install bq"
        return
    }

    # Create BigQuery dataset
    Write-Info "Creating BigQuery dataset: $BQDataset..."
    bq --location=US mk -d `
        --description "KMS audit logs for security analysis" `
        --project_id=$ProjectId `
        $BQDataset 2>$null

    if ($LASTEXITCODE -ne 0) {
        Write-Warn "Dataset may already exist"
    }

    # Create log sink
    Write-Info "Creating log sink to BigQuery..."
    $sinkName = "kms-audit-bq"
    $filter = 'resource.type="audited_resource" AND protoPayload.serviceName="cloudkms.googleapis.com"'

    gcloud logging sinks create $sinkName `
        "bigquery.googleapis.com/projects/$ProjectId/datasets/$BQDataset" `
        --log-filter="$filter" `
        --project=$ProjectId `
        --quiet 2>$null

    if ($LASTEXITCODE -ne 0) {
        Write-Warn "Sink '$sinkName' may already exist"
    }

    # Get sink service account
    $sinkSA = gcloud logging sinks describe $sinkName `
        --project=$ProjectId `
        --format="value(writerIdentity)" 2>$null

    if ($sinkSA) {
        Write-Info "Grant BigQuery Data Editor to: $sinkSA"

        # Attempt to grant automatically
        gcloud projects add-iam-policy-binding $ProjectId `
            --member="$sinkSA" `
            --role="roles/bigquery.dataEditor" `
            --quiet 2>$null

        if ($LASTEXITCODE -ne 0) {
            Write-Warn "Could not auto-grant permissions. Run manually:"
            Write-Info "gcloud projects add-iam-policy-binding $ProjectId \"
            Write-Info "  --member='$sinkSA' \"
            Write-Info "  --role='roles/bigquery.dataEditor'"
        }
    }

    Write-Info "✅ BigQuery sink configured"
    Write-Info "   Dataset: projects/$ProjectId/datasets/$BQDataset"
}

function Setup-GCSSink {
    Write-Info "Setting up GCS log sink (long-term storage)..."

    # Check if gsutil exists
    if (-not (Get-Command gsutil -ErrorAction SilentlyContinue)) {
        Write-Warn "gsutil command not found. Skipping GCS setup."
        return
    }

    # Create GCS bucket
    Write-Info "Creating GCS bucket: $GCSBucket..."
    gsutil mb -p $ProjectId -l US "gs://$GCSBucket/" 2>$null

    if ($LASTEXITCODE -ne 0) {
        Write-Warn "Bucket may already exist"
    }

    # Enable lifecycle policy (delete after 2 years)
    $lifecycleJson = @{
        lifecycle = @{
            rule = @(
                @{
                    action = @{ type = "Delete" }
                    condition = @{ age = 730 }
                }
            )
        }
    } | ConvertTo-Json -Depth 10

    $lifecycleJson | Out-File -FilePath "$env:TEMP\lifecycle.json" -Encoding UTF8
    gsutil lifecycle set "$env:TEMP\lifecycle.json" "gs://$GCSBucket/" 2>$null
    Remove-Item "$env:TEMP\lifecycle.json" -ErrorAction SilentlyContinue

    # Create log sink
    Write-Info "Creating log sink to GCS..."
    $sinkName = "kms-audit-gcs"
    $filter = 'resource.type="audited_resource" AND protoPayload.serviceName="cloudkms.googleapis.com"'

    gcloud logging sinks create $sinkName `
        "storage.googleapis.com/$GCSBucket" `
        --log-filter="$filter" `
        --project=$ProjectId `
        --quiet 2>$null

    if ($LASTEXITCODE -ne 0) {
        Write-Warn "Sink '$sinkName' may already exist"
    }

    # Get sink service account
    $sinkSA = gcloud logging sinks describe $sinkName `
        --project=$ProjectId `
        --format="value(writerIdentity)" 2>$null

    if ($sinkSA) {
        Write-Info "Grant Storage Object Creator to: $sinkSA"

        # Attempt to grant automatically
        gsutil iam ch "${sinkSA}:roles/storage.objectCreator" "gs://$GCSBucket/" 2>$null

        if ($LASTEXITCODE -ne 0) {
            Write-Warn "Could not auto-grant permissions. Run manually:"
            Write-Info "gsutil iam ch ${sinkSA}:roles/storage.objectCreator gs://$GCSBucket/"
        }
    }

    Write-Info "✅ GCS sink configured"
    Write-Info "   Bucket: gs://$GCSBucket"
    Write-Info "   Retention: 2 years (automatic deletion)"
}

function Test-Setup {
    Write-Info "Verifying audit log configuration..."

    # Check if audit logs are flowing
    Write-Info "Testing log query (may take a few minutes for logs to appear)..."

    $recentLogs = gcloud logging read `
        'resource.type="audited_resource" AND protoPayload.serviceName="cloudkms.googleapis.com"' `
        --limit=5 `
        --format="value(timestamp)" `
        --project=$ProjectId 2>$null

    if ($recentLogs) {
        $logCount = ($recentLogs | Measure-Object).Count
        Write-Info "✅ Found $logCount recent audit log entries"
    }
    else {
        Write-Warn "No audit logs found yet (may take 5-10 minutes to appear)"
        Write-Info "Perform a KMS operation to generate test logs:"
        Write-Info "  docker exec ai-finance-backend-1 python -m app.cli crypto-status"
    }

    Write-Info ""
    Write-Info "Example queries:"
    Write-Info "  # View recent KMS operations"
    Write-Info "  gcloud logging read 'resource.type=`"audited_resource`" AND protoPayload.serviceName=`"cloudkms.googleapis.com`"' --limit=10 --format=json"
    Write-Info ""
    Write-Info "  # BigQuery analysis (after data loads)"
    Write-Info "  bq query --use_legacy_sql=false 'SELECT timestamp, protopayload_auditlog.methodName, protopayload_auditlog.authenticationInfo.principalEmail FROM ``$ProjectId.$BQDataset.cloudaudit_googleapis_com_data_access_*`` ORDER BY timestamp DESC LIMIT 10'"
}

function Write-Summary {
    Write-Info ""
    Write-Info "=========================================="
    Write-Info "KMS Audit Logging Setup Complete"
    Write-Info "=========================================="
    Write-Info ""
    Write-Info "Configuration:"
    Write-Info "  ✅ Audit logs enabled: ADMIN_READ, DATA_READ, DATA_WRITE"
    if ($SetupBigQuery) {
        Write-Info "  ✅ BigQuery sink: projects/$ProjectId/datasets/$BQDataset"
    }
    if ($SetupGCS) {
        Write-Info "  ✅ GCS sink: gs://$GCSBucket"
    }
    Write-Info ""
    Write-Info "Next Steps:"
    Write-Info "  1. Wait 5-10 minutes for logs to start flowing"
    Write-Info "  2. Perform a KMS operation to generate test logs"
    Write-Info "  3. Query logs using examples above"
    Write-Info "  4. Set up BigQuery alerts (optional)"
    Write-Info "  5. Configure log-based metrics in Cloud Monitoring"
    Write-Info ""
    Write-Info "Documentation:"
    Write-Info "  - Audit logs: https://cloud.google.com/kms/docs/logging"
    Write-Info "  - Log sinks: https://cloud.google.com/logging/docs/export"
    Write-Info ""
}

# Main execution
try {
    Write-Info "Starting KMS Audit Logging Setup"
    Write-Info "Project: $ProjectId"
    Write-Info ""

    Test-Prerequisites
    Enable-KMSApi
    Set-AuditLogs

    if ($SetupBigQuery) {
        Setup-BigQuerySink
    }
    else {
        $response = Read-Host "Set up BigQuery sink for analysis? (y/N)"
        if ($response -eq 'y' -or $response -eq 'Y') {
            Setup-BigQuerySink
        }
    }

    if ($SetupGCS) {
        Setup-GCSSink
    }
    else {
        $response = Read-Host "Set up GCS sink for long-term storage? (y/N)"
        if ($response -eq 'y' -or $response -eq 'Y') {
            Setup-GCSSink
        }
    }

    Test-Setup
    Write-Summary

    Write-Info "✅ Setup complete!"
}
catch {
    Write-Err "Setup failed: $_"
    exit 1
}
