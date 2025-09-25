# KMS Mode Quick Commands

- Status:
  - `python -m app.cli crypto-status`

- New active DEK (no downtime; old DEKs decrypt):
  - `python -m app.cli force-new-active-dek --kms`

- Rewrap DEK to a different GCP KMS key (KEK migration):
  - `python -m app.cli kek-rewrap-gcp-to --to <new-kms-key-resource>`
  - Optional dry-run: add `--dry-run`

- Health check:
  - Backend `/healthz` should indicate crypto is ready. Alert if missing active label or init errors appear.

- AAD discipline:
  - Use distinct `GCP_KMS_AAD` per environment (e.g., `ledgermind-dev`, `ledgermind-prod`).

- Emergency switch (dev only):
  - `ENCRYPTION_ENABLED="0"` disables encryption paths for troubleshooting.

## Docker Compose examples

- Ensure backend has:
  - `ENCRYPTION_ENABLED=1`
  - `GCP_KMS_KEY=projects/<proj>/locations/<loc>/keyRings/ledgermind/cryptoKeys/<key>`
  - `GCP_KMS_AAD=<env-unique>`
  - `GOOGLE_APPLICATION_CREDENTIALS=/secrets/gcp-sa.json`
  - A volume mount for the service account JSON: `./secrets/prod-gcp-sa.json:/secrets/gcp-sa.json:ro`

## Rotation runbook (zero-downtime)

1) Create a fresh active DEK and export the wrapped key (KMS mode preferred):

```sh
docker compose exec backend sh -lc "python -m app.cli force-new-active-dek --kms && python -m app.cli crypto-export-active --out /tmp/active-dek.json"
```

2) Copy the export to your workstation and retain a timestamped filename:

```powershell
docker cp ai-finance-agent-oss-clean-backend-1:/tmp/active-dek.json .\active-dek-$(Get-Date -Format 'yyyyMMdd-HHmmss').json
```

3) Upload the export to the hardened bucket (`gs://ledgermind-secrets-prod`) with versioning enabled:

```powershell
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
gcloud storage cp .\active-dek-$stamp.json gs://ledgermind-secrets-prod/kms/active-dek-$stamp.json
```

4) Verify the backend sees the new key:

```sh
docker compose exec backend sh -lc 'python -m app.cli crypto-status'
```

5) Optional: re-encrypt stored rows so they use the newest DEK (not required for correctness). If your build includes the `dek-reencrypt` helper, run:

```sh
docker compose exec backend sh -lc 'python -m app.cli dek-reencrypt --batch 1000 --sleep 0.05'
```

If the batch helper is unavailable, fall back to the manual `dek-rotate-*` commands below.

#### Manual rotation fallback

```sh
# Begin rotation and switch write label to a new label automatically
docker compose exec backend sh -lc 'python -m app.cli dek-rotate-begin'

# Process in batches; repeat until done
docker compose exec backend sh -lc 'python -m app.cli dek-rotate-run --new-label rotating::<timestamp> --batch-size 1000 --max-batches 0'

# Finalize: rename new label to active and retire the previous
docker compose exec backend sh -lc 'python -m app.cli dek-rotate-finalize --new-label rotating::<timestamp>'
```

### Disaster recovery (import)

Use the new import command to restore an exported active DEK into the database. This safely retires the current active row and installs the wrapped key from disk.

```sh
docker compose exec backend sh -lc 'python -m app.cli crypto-import-active /tmp/active-dek.json --force'
docker compose exec backend sh -lc 'python -m app.cli crypto-status'
```

Append `--allow-mismatch` only when intentionally restoring an export generated under a different `GCP_KMS_KEY` or `GCP_KMS_AAD`.

### KMS rewrap (no data rewrite)

Rewrap to a new KMS key without rewriting data:

```sh
docker compose exec backend sh -lc \
  'python -m app.cli kek-rewrap-gcp-to \
     --to projects/<proj>/locations/<loc>/keyRings/ledgermind/cryptoKeys/<new-key>'
```

Notes:
- Rewrapping changes only the wrapping of the stored DEK; encrypted data remains intact.
- Ensure the service account has `cloudkms.cryptoKeyEncrypterDecrypter` on both old and new keys during migration.
