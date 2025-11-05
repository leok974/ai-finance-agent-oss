#!/usr/bin/env python3
"""
Database Freshness Exporter for Prometheus Pushgateway

Queries max timestamp from configured database tables and pushes metrics
to Prometheus Pushgateway for monitoring data staleness.

Environment Variables:
    PGHOST: Postgres host (default: postgres)
    PGPORT: Postgres port (default: 5432)
    PGUSER: Postgres user (default: myuser)
    PGPASSWORD: Postgres password (default: mypassword)
    PGDATABASE: Database name (default: finance)
    PGSCHEMA: Default schema (default: public)
    FRESHNESS_TABLES: Comma-separated table list (default: transactions,transaction_labels,ml_features)
    FRESHNESS_TIMESTAMP_COL: Timestamp column name (default: updated_at)
    PUSHGATEWAY_URL: Pushgateway URL (default: http://pushgateway:9091)
    PUSH_JOB_NAME: Job name for metrics (default: dbt_source_freshness)
    PUSH_INSTANCE: Instance label (default: hostname)
    PG_TIMEOUT_SECONDS: Connection timeout (default: 6.0)
"""
import os
import sys
import time
import socket
import contextlib
import psycopg2
import requests

# === Configuration ===
PGHOST = os.getenv("PGHOST", "postgres")
PGPORT = int(os.getenv("PGPORT", "5432"))
PGUSER = os.getenv("PGUSER", "myuser")
PGPASSWORD = os.getenv("PGPASSWORD", "mypassword")
PGDATABASE = os.getenv("PGDATABASE", "finance")
SCHEMA = os.getenv("PGSCHEMA", "public")

# Comma-separated list of tables to check (name or schema.name)
TABLES = [t.strip() for t in os.getenv(
    "FRESHNESS_TABLES",
    "transactions,transaction_labels,ml_features"
).split(",") if t.strip()]

TIMESTAMP_COLUMN = os.getenv("FRESHNESS_TIMESTAMP_COL", "updated_at")

PUSHGATEWAY_URL = os.getenv("PUSHGATEWAY_URL", "http://pushgateway:9091")
JOB_NAME = os.getenv("PUSH_JOB_NAME", "dbt_source_freshness")
INSTANCE = os.getenv("PUSH_INSTANCE", socket.gethostname())

TIMEOUT = int(float(os.getenv("PG_TIMEOUT_SECONDS", "6")))


def _split_table(t: str):
    """Split table reference into schema and name."""
    if "." in t:
        s, n = t.split(".", 1)
        return s, n
    return SCHEMA, t


def main():
    print(f"[INFO] Starting freshness export for {len(TABLES)} table(s)")
    print(f"[INFO] Timestamp column: {TIMESTAMP_COLUMN}")
    print(f"[INFO] Pushgateway: {PUSHGATEWAY_URL}")
    
    # Connect to Postgres
    dsn = f"host={PGHOST} port={PGPORT} user={PGUSER} password={PGPASSWORD} dbname={PGDATABASE}"
    
    try:
        with contextlib.closing(psycopg2.connect(dsn=dsn, connect_timeout=TIMEOUT)) as conn:
            conn.autocommit = True
            cur = conn.cursor()

            lines = []
            lines.append("# TYPE dbt_source_loaded_at_seconds gauge")
            lines.append("# HELP dbt_source_loaded_at_seconds Unix timestamp of last data update per source table")
            now = int(time.time())

            for t in TABLES:
                schema, name = _split_table(t)
                print(f"[INFO] Checking {schema}.{name}...")
                
                # Robust quoting for SQL injection prevention
                try:
                    cur.execute(
                        f'SELECT EXTRACT(EPOCH FROM MAX("{TIMESTAMP_COLUMN}"))::bigint FROM "{schema}"."{name}"'
                    )
                    row = cur.fetchone()
                    epoch = int(row[0]) if row and row[0] is not None else 0
                    
                    if epoch == 0:
                        print(f"[WARN] No data or NULL timestamp for {schema}.{name}")
                    else:
                        age_hours = (now - epoch) / 3600.0
                        print(f"[INFO]   Last update: {epoch} ({age_hours:.1f} hours ago)")
                    
                    # Emit metric line
                    lines.append(f'dbt_source_loaded_at_seconds{{table="{name}",schema="{schema}"}} {epoch}')
                    
                except psycopg2.Error as e:
                    print(f"[ERROR] Failed to query {schema}.{name}: {e}", file=sys.stderr)
                    # Continue with other tables
                    continue

            body = "\n".join(lines) + "\n"

    except psycopg2.Error as e:
        print(f"[ERROR] Database connection failed: {e}", file=sys.stderr)
        return 1

    # Push to pushgateway (job + instance grouping)
    url = f"{PUSHGATEWAY_URL}/metrics/job/{JOB_NAME}/instance/{INSTANCE}"
    
    try:
        print(f"[INFO] Pushing to {url}...")
        r = requests.put(url, data=body.encode("utf-8"), timeout=5)
        
        if r.status_code // 100 != 2:
            print(f"[ERROR] Pushgateway responded {r.status_code}: {r.text[:2000]}", file=sys.stderr)
            return 1
            
        print(f"[OK] Successfully pushed freshness for {len(TABLES)} table(s)")
        return 0
        
    except requests.RequestException as e:
        print(f"[ERROR] Failed to push to Pushgateway: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
