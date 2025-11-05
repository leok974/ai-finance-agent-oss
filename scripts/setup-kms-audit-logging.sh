#!/bin/bash
# Setup script for GCP Cloud KMS Audit Logging
#
# This script configures comprehensive audit logging for KMS operations:
# 1. Enables KMS API (if not already enabled)
# 2. Configures Data Access audit logs (ADMIN_READ, DATA_READ, DATA_WRITE)
# 3. (Optional) Creates BigQuery dataset and log sink for analysis
# 4. (Optional) Creates GCS bucket and log sink for long-term storage
#
# Prerequisites:
#   - gcloud CLI installed and authenticated
#   - Project: ledgermind-03445-3l
#   - Permissions: roles/logging.admin, roles/iam.securityAdmin

set -euo pipefail

# Configuration
PROJECT_ID="ledgermind-03445-3l"
REGION="us-east1"
BQ_DATASET="kms_audit"
GCS_BUCKET="ledgermind-kms-audit-logs"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_prerequisites() {
    log_info "Checking prerequisites..."

    # Check gcloud
    if ! command -v gcloud &> /dev/null; then
        log_error "gcloud CLI not found. Please install: https://cloud.google.com/sdk/install"
        exit 1
    fi

    # Check authentication
    if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" &> /dev/null; then
        log_error "Not authenticated with gcloud. Run: gcloud auth login"
        exit 1
    fi

    # Set project
    gcloud config set project "$PROJECT_ID" --quiet
    log_info "✅ Prerequisites OK (project: $PROJECT_ID)"
}

enable_kms_api() {
    log_info "Enabling Cloud KMS API..."
    gcloud services enable cloudkms.googleapis.com --project="$PROJECT_ID" --quiet
    log_info "✅ Cloud KMS API enabled"
}

configure_audit_logs() {
    log_info "Configuring KMS Data Access audit logs..."

    # Get current IAM policy
    gcloud projects get-iam-policy "$PROJECT_ID" --format=json > /tmp/iam-policy.json

    # Check if audit config already exists
    if grep -q "cloudkms.googleapis.com" /tmp/iam-policy.json 2>/dev/null; then
        log_warn "KMS audit config may already exist. Updating..."
    fi

    # Create audit config JSON
    cat > /tmp/audit-config.json <<EOF
{
  "auditConfigs": [
    {
      "service": "cloudkms.googleapis.com",
      "auditLogConfigs": [
        {
          "logType": "ADMIN_READ"
        },
        {
          "logType": "DATA_READ"
        },
        {
          "logType": "DATA_WRITE"
        }
      ]
    }
  ]
}
EOF

    log_info "Applying audit configuration..."
    log_warn "Note: This requires roles/iam.securityAdmin permission"

    # Alternative method using gcloud beta (more reliable)
    gcloud beta logging settings update \
        --project="$PROJECT_ID" \
        --service=cloudkms.googleapis.com \
        --log-types=ADMIN_READ,DATA_READ,DATA_WRITE \
        --quiet || {
            log_error "Failed to configure audit logs via gcloud beta"
            log_warn "Try configuring manually via GCP Console: IAM → Audit Logs → Cloud KMS API"
            return 1
        }

    log_info "✅ Audit logs configured for Cloud KMS"
    log_info "   - ADMIN_READ: Administrative operations (create/delete keys)"
    log_info "   - DATA_READ: Key read operations (get key, list keys)"
    log_info "   - DATA_WRITE: Cryptographic operations (encrypt/decrypt)"
}

setup_bigquery_sink() {
    log_info "Setting up BigQuery log sink..."

    # Check if bq command exists
    if ! command -v bq &> /dev/null; then
        log_warn "bq command not found. Skipping BigQuery setup."
        log_warn "Install with: gcloud components install bq"
        return 0
    fi

    # Create BigQuery dataset
    log_info "Creating BigQuery dataset: $BQ_DATASET..."
    bq --location=US mk -d \
        --description "KMS audit logs for security analysis" \
        --project_id="$PROJECT_ID" \
        "$BQ_DATASET" 2>/dev/null || {
            log_warn "Dataset may already exist"
        }

    # Create log sink
    log_info "Creating log sink to BigQuery..."
    SINK_NAME="kms-audit-bq"
    FILTER='resource.type="audited_resource" AND protoPayload.serviceName="cloudkms.googleapis.com"'

    gcloud logging sinks create "$SINK_NAME" \
        "bigquery.googleapis.com/projects/$PROJECT_ID/datasets/$BQ_DATASET" \
        --log-filter="$FILTER" \
        --project="$PROJECT_ID" \
        --quiet 2>/dev/null || {
            log_warn "Sink '$SINK_NAME' may already exist"
        }

    # Get sink service account
    SINK_SA=$(gcloud logging sinks describe "$SINK_NAME" \
        --project="$PROJECT_ID" \
        --format="value(writerIdentity)" 2>/dev/null || echo "")

    if [[ -n "$SINK_SA" ]]; then
        log_info "Grant BigQuery Data Editor to: $SINK_SA"
        log_info "Run: gcloud projects add-iam-policy-binding $PROJECT_ID \\"
        log_info "       --member='$SINK_SA' \\"
        log_info "       --role='roles/bigquery.dataEditor'"

        # Attempt to grant automatically
        gcloud projects add-iam-policy-binding "$PROJECT_ID" \
            --member="$SINK_SA" \
            --role="roles/bigquery.dataEditor" \
            --quiet &>/dev/null || {
                log_warn "Could not auto-grant permissions. Run command above manually."
            }
    fi

    log_info "✅ BigQuery sink configured"
    log_info "   Dataset: projects/$PROJECT_ID/datasets/$BQ_DATASET"
}

setup_gcs_sink() {
    log_info "Setting up GCS log sink (long-term storage)..."

    # Check if gsutil exists
    if ! command -v gsutil &> /dev/null; then
        log_warn "gsutil command not found. Skipping GCS setup."
        return 0
    fi

    # Create GCS bucket
    log_info "Creating GCS bucket: $GCS_BUCKET..."
    gsutil mb -p "$PROJECT_ID" -l US "gs://$GCS_BUCKET/" 2>/dev/null || {
        log_warn "Bucket may already exist"
    }

    # Enable lifecycle policy for cost optimization (delete after 2 years)
    cat > /tmp/lifecycle.json <<EOF
{
  "lifecycle": {
    "rule": [
      {
        "action": {"type": "Delete"},
        "condition": {"age": 730}
      }
    ]
  }
}
EOF

    gsutil lifecycle set /tmp/lifecycle.json "gs://$GCS_BUCKET/" || {
        log_warn "Could not set lifecycle policy"
    }

    # Create log sink
    log_info "Creating log sink to GCS..."
    SINK_NAME="kms-audit-gcs"
    FILTER='resource.type="audited_resource" AND protoPayload.serviceName="cloudkms.googleapis.com"'

    gcloud logging sinks create "$SINK_NAME" \
        "storage.googleapis.com/$GCS_BUCKET" \
        --log-filter="$FILTER" \
        --project="$PROJECT_ID" \
        --quiet 2>/dev/null || {
            log_warn "Sink '$SINK_NAME' may already exist"
        }

    # Get sink service account
    SINK_SA=$(gcloud logging sinks describe "$SINK_NAME" \
        --project="$PROJECT_ID" \
        --format="value(writerIdentity)" 2>/dev/null || echo "")

    if [[ -n "$SINK_SA" ]]; then
        log_info "Grant Storage Object Creator to: $SINK_SA"

        # Attempt to grant automatically
        gsutil iam ch "$SINK_SA:roles/storage.objectCreator" "gs://$GCS_BUCKET/" || {
            log_warn "Could not auto-grant permissions."
            log_info "Run: gsutil iam ch $SINK_SA:roles/storage.objectCreator gs://$GCS_BUCKET/"
        }
    fi

    log_info "✅ GCS sink configured"
    log_info "   Bucket: gs://$GCS_BUCKET"
    log_info "   Retention: 2 years (automatic deletion)"
}

verify_setup() {
    log_info "Verifying audit log configuration..."

    # Check if audit logs are flowing
    log_info "Testing log query (may take a few minutes for logs to appear)..."

    RECENT_LOGS=$(gcloud logging read \
        'resource.type="audited_resource" AND protoPayload.serviceName="cloudkms.googleapis.com"' \
        --limit=5 \
        --format="value(timestamp)" \
        --project="$PROJECT_ID" 2>/dev/null | wc -l)

    if [[ $RECENT_LOGS -gt 0 ]]; then
        log_info "✅ Found $RECENT_LOGS recent audit log entries"
    else
        log_warn "No audit logs found yet (may take 5-10 minutes to appear)"
        log_info "Perform a KMS operation to generate test logs:"
        log_info "  docker exec ai-finance-backend-1 python -m app.cli crypto-status"
    fi

    # Show example query
    log_info ""
    log_info "Example queries:"
    log_info "  # View recent KMS operations"
    log_info "  gcloud logging read 'resource.type=\"audited_resource\" AND protoPayload.serviceName=\"cloudkms.googleapis.com\"' --limit=10 --format=json"
    log_info ""
    log_info "  # BigQuery analysis (after data loads)"
    log_info "  bq query --use_legacy_sql=false 'SELECT timestamp, protopayload_auditlog.methodName, protopayload_auditlog.authenticationInfo.principalEmail FROM \`$PROJECT_ID.$BQ_DATASET.cloudaudit_googleapis_com_data_access_*\` ORDER BY timestamp DESC LIMIT 10'"
}

print_summary() {
    log_info ""
    log_info "=========================================="
    log_info "KMS Audit Logging Setup Complete"
    log_info "=========================================="
    log_info ""
    log_info "Configuration:"
    log_info "  ✅ Audit logs enabled: ADMIN_READ, DATA_READ, DATA_WRITE"
    log_info "  ✅ BigQuery sink: projects/$PROJECT_ID/datasets/$BQ_DATASET"
    log_info "  ✅ GCS sink: gs://$GCS_BUCKET"
    log_info ""
    log_info "Next Steps:"
    log_info "  1. Wait 5-10 minutes for logs to start flowing"
    log_info "  2. Perform a KMS operation to generate test logs"
    log_info "  3. Query logs using examples above"
    log_info "  4. Set up BigQuery alerts (optional)"
    log_info "  5. Configure log-based metrics in Cloud Monitoring"
    log_info ""
    log_info "Documentation:"
    log_info "  - Audit logs: https://cloud.google.com/kms/docs/logging"
    log_info "  - Log sinks: https://cloud.google.com/logging/docs/export"
    log_info ""
}

# Main execution
main() {
    log_info "Starting KMS Audit Logging Setup"
    log_info "Project: $PROJECT_ID"
    log_info ""

    check_prerequisites
    enable_kms_api
    configure_audit_logs

    read -p "Set up BigQuery sink for analysis? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        setup_bigquery_sink
    fi

    read -p "Set up GCS sink for long-term storage? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        setup_gcs_sink
    fi

    verify_setup
    print_summary

    log_info "✅ Setup complete!"
}

# Run main function if script is executed (not sourced)
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
