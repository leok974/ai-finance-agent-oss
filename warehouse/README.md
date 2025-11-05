# LedgerMind Data Warehouse

This directory contains the dbt (Data Build Tool) project for LedgerMind's analytics warehouse. It transforms operational data from the PostgreSQL database into curated analytical models.

**🐳 Local Development**: This project uses Docker containers for local dbt execution to avoid version conflicts and match the CI/CD environment. See [Local Development](#local-development) section below.

## Architecture

```
warehouse/
├── models/
│   ├── staging/          # Raw data cleaning & validation
│   │   ├── stg_suggestion_events.sql
│   │   └── stg_suggestion_events.yml
│   └── marts/            # Business-level aggregates
│       ├── mart_suggestions_daily.sql
│       ├── mart_suggestions_feedback_daily.sql
│       ├── mart_suggestions_kpis.sql
│       └── *.yml         # Model configs & tests
├── tests/                # Custom test definitions
├── profiles.yml          # Connection configurations (local + BigQuery)
├── dbt_project.yml       # Project settings
├── Makefile             # 🆕 Convenience commands for Docker-based workflow
└── README.md            # This file
```

## Data Lineage

```
Operational DB (Postgres)
    ↓
sources.yml (suggestion_events, suggestion_feedback, transactions, model_registry)
    ↓
stg_suggestion_events (staging view)
    ↓
├── mart_suggestions_daily (daily aggregates)
├── mart_suggestions_feedback_daily (feedback metrics)
└── mart_suggestions_kpis (consolidated KPIs)
```

## Quick Start

### Prerequisites

1. **Docker** installed and running
2. **shared-ollama network** exists:
   ```bash
   docker network ls | grep shared-ollama
   ```
3. **Postgres container** running on shared-ollama network:
   ```bash
   docker ps | grep postgres
   ```

### Build Models (Docker Approach)

**Linux/macOS (using Makefile):**
```bash
# Navigate to warehouse directory
cd warehouse

# Test connection
make debug

# Build all models
make build

# Or build specific model sets
make staging  # Just staging views
make marts    # Just marts tables

# Run tests
make test
```

**Windows (using PowerShell script):**
```powershell
# Navigate to warehouse directory
cd warehouse

# Test connection
.\dbt.ps1 debug

# Build all models
.\dbt.ps1 build

# Or build specific model sets
.\dbt.ps1 staging  # Just staging views
.\dbt.ps1 marts    # Just marts tables

# Run tests
.\dbt.ps1 test
```

### Schedule Nightly Runs

GitHub Actions workflow at `.github/workflows/dbt-nightly.yml` runs at 3 AM UTC daily.

**Required secrets** (add in GitHub repo settings):
- `GCP_SA_JSON` (service account JSON key)
- `GCP_PROJECT` (ledgermind-ml-analytics)
- `DBT_BIGQUERY_DATASET` (ledgermind)

## Local Development

### Why Docker Container Approach?

We use a containerized dbt instead of local installation for several reasons:

1. **Network Isolation**: Postgres runs in Docker without exposed ports (security best practice)
2. **Consistency**: Same environment as CI/CD (GitHub Actions)
3. **No Version Conflicts**: Backend uses dbt-postgres 1.9.1, warehouse uses 1.7.0
4. **Portability**: Works on any machine with Docker

The container runs on the `shared-ollama` network and connects to postgres using the service name `postgres` instead of `localhost`.

### Convenience Commands

**Linux/macOS (Makefile):**
```bash
make help      # Show all available commands
make debug     # Test database connection
make deps      # Install dbt packages
make build     # Build all models (staging + marts)
make staging   # Build staging models only
make marts     # Build marts models only
make test      # Run dbt tests
make clean     # Remove target/ directory
```

**Windows (PowerShell):**
```powershell
.\dbt.ps1 help      # Show all available commands
.\dbt.ps1 debug     # Test database connection
.\dbt.ps1 deps      # Install dbt packages
.\dbt.ps1 build     # Build all models (staging + marts)
.\dbt.ps1 staging   # Build staging models only
.\dbt.ps1 marts     # Build marts models only
.\dbt.ps1 test      # Run dbt tests
.\dbt.ps1 clean     # Remove target/ and logs/ directories
```

### Manual Docker Commands

If you prefer not to use the Makefile:

```bash
# From warehouse/ directory
docker run --rm -it \
  --network shared-ollama \
  -v "$(pwd):/work" \
  -w /work \
  ghcr.io/dbt-labs/dbt-postgres:1.7.0 \
  debug --profiles-dir .

# Build models
docker run --rm -it \
  --network shared-ollama \
  -v "$(pwd):/work" \
  -w /work \
  ghcr.io/dbt-labs/dbt-postgres:1.7.0 \
  run --profiles-dir . --select staging marts
```

## Data Models

### Staging Layer

**stg_suggestion_events**
- Type: View
- Source: `suggestion_events` table
- Purpose: Clean and standardize raw suggestion events
- Columns: event_id, txn_id, mode (heuristic/model), model_id, candidates, created_at
- Build time: ~0.13s

### Marts Layer

**mart_suggestions_daily**
- Type: Table
- Purpose: Daily aggregation of suggestion events
- Metrics: total events, events by mode (heuristic/model), avg candidate count
- Build time: ~0.20s

**mart_suggestions_feedback_daily**
- Type: Table
- Purpose: Daily feedback aggregates with accept/reject/undo counts
- Metrics: events, accepts, rejects, undos, accept_rate by mode and model_id
- Build time: ~0.19s

**mart_suggestions_kpis**
- Type: Table
- Purpose: Consolidated KPIs joining daily aggregates with feedback
- Metrics: events_total, events by mode, avg_candidate_count, accept_rate_overall
- Build time: ~0.07s

## BigQuery Optimizations

- **Partitioning**: `mart_suggestions_daily` partitioned by `created_date` (reduces query costs for recent data)
- **Clustering**: Clustered by `mode`, `source`, `model_id` (optimizes filtering on these columns)
- **Expiration**: Consider adding partition expiration (e.g., 90 days) for cost savings

## Grafana Integration

Connect Grafana to BigQuery, then query marts:

```sql
-- Daily suggestions trend
SELECT
  created_date,
  mode,
  SUM(event_count) AS events
FROM `your-project.ledgermind_analytics.mart_suggestions_daily`
WHERE created_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
GROUP BY 1, 2
ORDER BY 1 DESC
```

See `PROFILES_README.md` for full integration examples.

## Data Freshness

- **Real-time metrics**: Use Prometheus `/metrics` endpoint for live monitoring (lm_suggestions_total, etc.)
- **Historical analysis**: Use dbt marts for trends, experiments, and long-term KPIs

## Testing

Data quality tests defined in `.yml` files:
- **Source tests**: not_null, accepted_values on raw data
- **Staging tests**: unique, not_null on event_id
- **Mart tests**: not_null on computed columns

Run tests: `dbt test` (fails CI if data quality issues detected)

## Extending

### Add Feedback Mart

Create `models/marts/mart_suggestions_feedback_daily.sql`:

```sql
WITH feedback AS (
  SELECT
    e.created_date,
    e.mode,
    e.source,
    f.action,
    COUNT(*) AS action_count
  FROM {{ ref('stg_suggestion_events') }} e
  JOIN {{ source('app', 'suggestion_feedback') }} f
    ON f.event_id = e.event_id
  GROUP BY 1, 2, 3, 4
)

SELECT * FROM feedback
```

### Add Model Experiments Mart

Track experiment performance (shadow/canary/live):

```sql
-- Assumes `experiment_tag` in metadata
SELECT
  created_date,
  model_id,
  JSON_EXTRACT_SCALAR(metadata, '$.experiment') AS experiment,
  COUNT(*) AS event_count
FROM {{ ref('stg_suggestion_events') }}
WHERE mode = 'model'
GROUP BY 1, 2, 3
```

## Data Verification

After building models, verify data:

```bash
# Check mart_suggestions_kpis
docker compose -f ../docker-compose.prod.yml exec -T postgres \
  psql -U myuser -d finance \
  -c "SELECT * FROM mart_suggestions_kpis ORDER BY created_date DESC LIMIT 5"

# Check feedback daily
docker compose -f ../docker-compose.prod.yml exec -T postgres \
  psql -U myuser -d finance \
  -c "SELECT * FROM mart_suggestions_feedback_daily ORDER BY created_date DESC LIMIT 10"
```

## Troubleshooting

### "relation does not exist" Error

This error occurs when running dbt locally (not in Docker):

```
Database Error: relation "public.suggestion_events" does not exist
```

**Cause**: Postgres is not exposed on host port 5432 in docker-compose.prod.yml

**Solution**: Use the Docker container approach (Makefile commands or manual Docker commands above)

### Connection Timeout

If `make debug` times out:

1. Check Postgres is running:
   ```bash
   docker ps | grep postgres
   ```

2. Check network connectivity:
   ```bash
   docker inspect ai-finance-agent-oss-clean-postgres-1 --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}}{{end}}'
   # Should show: shared-ollama
   ```

3. Verify credentials in `profiles.yml` match database

### Collation Version Mismatch Warning

You may see warnings about collation version mismatch:

```
WARNING: database "finance" has a collation version mismatch
DETAIL: The database was created using collation version 2.41, but the operating system provides version 2.36.
```

This is a Postgres warning that can be safely ignored for local development. To fix permanently:

```sql
ALTER DATABASE finance REFRESH COLLATION VERSION;
```

## Production Checklist

- [ ] BigQuery dataset created (`ledgermind_analytics`)
- [ ] Service account with Data Editor + Job User roles
- [ ] GitHub secrets configured
- [ ] Data replication from app DB to warehouse (Fivetran/Airbyte)
- [ ] Partition expiration set (optional, for cost savings)
- [ ] Grafana connected to BigQuery
- [ ] dbt docs deployed: `dbt docs generate && dbt docs serve`

## Resources

- [dbt Documentation](https://docs.getdbt.com/)
- [BigQuery Partitioning](https://cloud.google.com/bigquery/docs/partitioned-tables)
- [dbt Utils Package](https://github.com/dbt-labs/dbt-utils)
