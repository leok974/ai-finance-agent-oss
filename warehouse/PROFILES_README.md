# dbt Profiles Configuration Examples

## BigQuery (Production)

Create `~/.dbt/profiles.yml`:

```yaml
ledgermind:
  target: prod
  outputs:
    prod:
      type: bigquery
      method: service-account
      project: your-gcp-project-id
      dataset: ledgermind_analytics
      keyfile: /path/to/service-account-keyfile.json
      location: US
      threads: 4
      timeout_seconds: 300
```

**Setup Steps:**
1. Create BigQuery dataset: `ledgermind_analytics`
2. Create service account with BigQuery Data Editor + Job User roles
3. Download JSON keyfile
4. Set `keyfile` path in profiles.yml
5. Run `dbt debug` to validate connection

## Postgres (Local Development)

For testing against local Postgres instead of BigQuery:

```yaml
ledgermind:
  target: dev
  outputs:
    dev:
      type: postgres
      host: localhost
      port: 5432
      user: postgres
      password: your_password
      dbname: ledgermind
      schema: analytics
      threads: 4
```

**Setup Steps:**
1. Install dbt-postgres: `pip install dbt-postgres`
2. Create schema: `CREATE SCHEMA analytics;`
3. Update connection details in profiles.yml
4. Run `dbt debug` to validate

## GitHub Actions Secrets

For the nightly workflow (`.github/workflows/dbt-nightly.yml`), configure these secrets in your GitHub repository:

- `DBT_BIGQUERY_PROJECT` → Your GCP project ID
- `DBT_BIGQUERY_DATASET` → `ledgermind_analytics`
- `DBT_BIGQUERY_KEYFILE_JSON` → Full JSON keyfile contents (paste entire JSON)

**To add secrets:**
1. Go to repository Settings → Secrets and variables → Actions
2. Click "New repository secret"
3. Add each secret name and value

## Data Source Configuration

The dbt models expect data from your operational database. You have two options:

### Option 1: Direct Connection (Dev/Testing)
Point `sources.yml` directly at your app database:

```yaml
sources:
  - name: app
    database: ledgermind
    schema: public
    tables:
      - name: suggestion_events
      - name: suggestion_feedback
      - name: transactions
```

### Option 2: Replicated Warehouse (Production)
Use Fivetran, Airbyte, or native replication to sync app DB → BigQuery:

1. Set up replication from Postgres → BigQuery
2. Create dataset `ledgermind_raw` in BigQuery
3. Update `sources.yml`:
   ```yaml
   sources:
     - name: app
       database: your-gcp-project
       schema: ledgermind_raw
   ```

## Validation Commands

After configuring profiles:

```bash
cd warehouse
dbt debug              # Test connection
dbt deps               # Install dbt_utils
dbt parse              # Validate syntax
dbt compile            # Generate SQL
dbt run --select staging  # Build staging views
dbt test --select staging  # Run tests
dbt run --select marts     # Build marts
dbt test               # Run all tests
```

## Grafana Integration

Once marts are built, connect Grafana to BigQuery:

1. Install BigQuery data source plugin
2. Create data source with same service account
3. Example query for `mart_suggestions_daily`:

```sql
SELECT
  created_date,
  mode,
  SUM(event_count) AS total_events,
  AVG(avg_candidate_count) AS avg_candidates
FROM `your-project.ledgermind_analytics.mart_suggestions_daily`
WHERE created_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
GROUP BY 1, 2
ORDER BY 1 DESC
```

## Troubleshooting

**"Relation does not exist"**: Check `sources.yml` database/schema match your setup

**"Permission denied"**: Ensure service account has BigQuery Data Editor + Job User roles

**"Compilation error"**: Run `dbt compile` to see full error, check Jinja syntax

**Slow queries**: Add `{{ log("Running " ~ this.name, info=True) }}` to debug which model is slow
