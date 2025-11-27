# Crypto / KMS Setup

This guide enables KMS-backed envelope encryption (mode `kms`) for LedgerMind.

## 1. Prerequisites
- GCP project with a KMS key ring + key (symmetric) created.
- Service Account with role: `roles/cloudkms.cryptoKeyEncrypterDecrypter` (and optionally `roles/cloudkms.viewer`).
- Download the service account JSON key (store securely; do not commit).

## 2. Place Service Account JSON
```
secrets/
  gcp-sa.json/
    ledgermind-backend-sa.json   # <== actual key file
```
Repo already ignores `secrets/` and explicit `*.gcp-sa.json` patterns.

## 3. Compose Environment
Set or confirm the following in `docker-compose.prod.override.yml` (already present if you followed Quick Start):
```
ENCRYPTION_ENABLED=1
GOOGLE_APPLICATION_CREDENTIALS=/secrets/gcp-sa.json
GCP_KMS_KEY=projects/<project>/locations/<loc>/keyRings/<ring>/cryptoKeys/<key>
GCP_KMS_AAD=app=ledgermind,env=prod
```

## 4. Start / Recreate Backend
```
docker compose -f docker-compose.prod.yml -f docker-compose.prod.override.yml up -d backend
```

## 5. Verify Inside Container
```
# Check file exists
python -c "import os, json,sys; p='/secrets/gcp-sa.json';print('IS_FILE', os.path.isfile(p));print(open(p)\n.read(120))"

# Crypto status
python -m app.cli crypto-status
```
Expected output subset:
```
{"label":"active","mode":"kms","wlen": <nonzero> }
```

## 6. (Optional) Initialize Explicitly
Normally first encryption operation triggers wrapping. To force early:
```
python -m app.cli crypto-init
python -m app.cli crypto-status
```
`mode` should remain `kms` and a wrapped key length (`wlen`) be visible.

## 7. /ready Endpoint
External readiness should show:
```
{"ok":true,"crypto_ready":true,"mode":"kms", ...}
```
If `crypto_ready:false`:
| Check | Why |
|-------|-----|
| Is service account file mounted (not directory)? | Directory mistaken for file prevents JSON read |
| ENCRYPTION_ENABLED=1 set? | Disabled flag short-circuits KMS init |
| Correct `GOOGLE_APPLICATION_CREDENTIALS` path? | Must match container path (/secrets/gcp-sa.json) |
| KMS key resource string accurate? | Typos produce permission or not found errors |
| Service account role includes cryptoKeyEncrypterDecrypter? | Missing role blocks wrap/unwrap |

## 8. Rotating the Key (Conceptual)
1. Add new KMS key version in GCP.
2. Update `GCP_KMS_KEY` only if using a *different* key (new version auto-used otherwise).
3. Restart backend; verify new wrap occurs (label may change).

## 9. Auditing
Capture output of:
```
python -m app.cli crypto-status > logs/crypto-status.$(date +%Y%m%dT%H%M%S).json
```
Keep a limited retention window; file includes only metadata (no plaintext material).

## 10. Common Errors
| Error Snippet | Meaning | Resolution |
|---------------|---------|-----------|
| `IsADirectoryError: [Errno 21]` | Mounted directory instead of file | Adjust volume to actual JSON file path |
| `403 Permission denied` | Missing KMS IAM role | Grant `cryptoKeyEncrypterDecrypter` & retry |
| `FileNotFoundError /secrets/gcp-sa.json` | Mount misconfigured | Update compose override volume |
| `crypto_ready:false` but no exception | Flag disabled or lazy init not triggered | Ensure ENCRYPTION_ENABLED=1 and invoke an encryption path or run init |

## 11. Security Notes
- Do not bake SA JSON into images.
- Consider using Workload Identity (GKE) or secret manager in future instead of JSON key.
- Limit service account key lifetime; rotate proactively.

See also: [`VERIFY_PROD.md`](VERIFY_PROD.md), [`TROUBLESHOOTING_CLOUDFLARE_TUNNEL.md`](TROUBLESHOOTING_CLOUDFLARE_TUNNEL.md).
