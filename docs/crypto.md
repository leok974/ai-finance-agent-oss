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

1) Create a new active DEK for new writes:

```sh
docker compose exec backend sh -lc 'python -m app.cli force-new-active-dek --kms'
```

2) Verify:

```sh
docker compose exec backend sh -lc 'python -m app.cli crypto-status'
```

3) Optional: Re-encrypt existing rows to newest DEK (not required for correctness). If a bulk re-encrypt command exists, use it; otherwise use the DEK rotation workflow (begin/run/finalize):

```sh
# Begin rotation and switch write label to a new label automatically
docker compose exec backend sh -lc 'python -m app.cli dek-rotate-begin'

# Process in batches; repeat until done
docker compose exec backend sh -lc 'python -m app.cli dek-rotate-run --new-label rotating::<timestamp> --batch-size 1000 --max-batches 0'

# Finalize: rename new label to active and retire the previous
docker compose exec backend sh -lc 'python -m app.cli dek-rotate-finalize --new-label rotating::<timestamp>'
```

4) Rewrap to a new KMS key without rewriting data:

```sh
docker compose exec backend sh -lc \
  'python -m app.cli kek-rewrap-gcp-to \
     --to projects/<proj>/locations/<loc>/keyRings/ledgermind/cryptoKeys/<new-key>'
```

Notes:
- Rewrapping changes only the wrapping of the stored DEK; encrypted data remains intact.
- Ensure the service account has `cloudkms.cryptoKeyEncrypterDecrypter` on both old and new keys during migration.
