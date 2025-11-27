# SECURITY

Security posture and operational security notes for LedgerMind.

## 1. Secrets & Credentials
| Item | Policy |
|------|--------|
| Service Account JSON | Never committed; stored under `secrets/gcp-sa.json/` (git-ignored) |
| Environment Files | `.env` may contain non-production creds; production uses deployment secrets store or CI inject. |
| Wrapped DEK (`active-dek.json`) | Treated as sensitive; not globally shared. |
| API Keys (OpenAI, etc.) | Set via env or mounted file var (`*_API_KEY_FILE`). |

.gitignore enforces exclusion of `secrets/` and `*.gcp-sa.json` patterns.

## 2. Encryption (Data at Rest / In-Use)
- Envelope encryption enabled when `ENCRYPTION_ENABLED=1` and KMS env vars present.
- Backend unwraps Data Encryption Key (DEK) in memory only; never written to disk.
- AAD (`GCP_KMS_AAD`) binds ciphertexts to deployment context.
- See: [CRYPTO_SETUP](CRYPTO_SETUP.md)

## 3. Transport Security
| Layer | Mechanism |
|-------|----------|
| Browser ↔ Cloudflare Edge | HTTPS (TLS termination at edge) |
| Cloudflare Edge ↔ cloudflared | Tunnel (QUIC / HTTP2) |
| cloudflared ↔ nginx | Plain HTTP (container network) |
| nginx ↔ Backend/Others | Plain HTTP (localhost network namespace) |

Rationale: Termination at Cloudflare simplifies cert rotation; internal traffic remains within trusted overlay.

## 4. Authentication & Session
- (If enabled) Cookie-based session or token header (implementation detail not fully documented here—expand as auth modules mature).
- CSRF mitigation: Prefer same-site cookies or explicit CSRF token for mutating endpoints (TODO if forms introduced).
- Admin endpoints can require `x-admin-token` when `ADMIN_TOKEN` env set.

## 5. Input Validation & PII
| Area | Approach |
|------|---------|
| API Payloads | Pydantic models enforce types / constraints |
| Redaction | PII redacted from logs where feasible (names, account identifiers) |
| Logging | Structured logging recommended; avoid dumping raw model prompts with sensitive data |

## 6. Least Privilege (GCP KMS)
Service Account must have only `roles/cloudkms.cryptoKeyEncrypterDecrypter` (and minimal additional roles for other resources if required). Avoid broader roles like `cloudkms.admin` in production.

## 7. Dependency & Supply Chain
| Domain | Control |
|--------|---------|
| Python | `requirements.txt` pinned; consider hash pinning (future) |
| Node | `pnpm-lock.yaml` committed for deterministic installs |
| Container Base | Distroless / slim images reduce attack surface |

Run `pip-audit` / `npm audit` periodically (automation pending).

## 8. Headers & Browser Hardening (Planned)
| Header | Status |
|--------|--------|
| Content-Security-Policy | TODO (restrict script/img origins) |
| Referrer-Policy | Set via nginx snippet (future) |
| Strict-Transport-Security | Managed by Cloudflare edge |
| X-Content-Type-Options | Add in nginx config (`nosniff`) |

## 9. Logging & Monitoring
| Concern | Guideline |
|---------|----------|
| Sensitive Fields | Never log raw credentials or account numbers |
| Model Prompts | Consider hashing / truncation for analytics |
| Rotation | Cloudflared + nginx logs rotated by Docker defaults (configure if growth) |

## 10. Incident Response (Lightweight)
| Scenario | Action |
|----------|--------|
| Suspected key leak | Rotate KMS key, rewrap DEK, revoke exposed env secrets |
| Model abuse / anomalous output | Add rate limiting / prompt filtering layer |
| Tunnel compromise | Revoke tunnel token, redeploy cloudflared with new credentials |

## 11. Future Enhancements
- Prometheus alert on zero healthy models (availability degradation).
- Automated dependency vuln scanning in CI.
- CSP + SRI for static assets.
- Token-based fine-grained admin auth.

Cross-refs: [CRYPTO_SETUP](CRYPTO_SETUP.md) · [OPERATIONS](OPERATIONS.md) (to be added) · [ARCHITECTURE](ARCHITECTURE.md)
