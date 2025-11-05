# Security Overview

A concise, high‑signal summary of the current hardening posture for this repository.

> Status: Actively hardened (Sep 2025). This document is a living overview, not a guarantee. See RECOMMENDED NEXT STEPS for items still pending or optional.

---
## 1. Defense-in-Depth Layers
| Layer | Control | Summary |
|-------|---------|---------|
| Build | Multi‑stage + distroless | Final backend image is based on `gcr.io/distroless/python3-debian12` (no shell/package manager) with dependencies installed in a builder stage only. |
| Execution | Non‑root UID/GID | Backend runs as `10001:10001`; Nginx runs as non-root (`101:101`). |
| FS Integrity | Read‑only root + tmpfs | Compose sets `read_only: true` and mounts only ephemeral tmpfs paths (`/tmp`, Nginx cache/run dirs). |
| Privilege | Capabilities dropped | `cap_drop: [ALL]` everywhere; only Nginx adds back `NET_BIND_SERVICE` for privileged ports if needed. |
| Privilege Escalation | `no-new-privileges` | Explicitly enabled to prevent gaining extra perms via setuid binaries (none should exist in distroless). |
| Syscall Surface | Seccomp (placeholder) | `security/seccomp-tight.json` provided; can be enabled after validation. |
| Networking | Minimal east‑west | Backend reachable only via internal Docker network; Cloudflare Tunnel fronts public ingress through Nginx. |
| Request Shaping | Rate limiting | `limit_req_zone` + per‑location `limit_req` for auth, API, SSE, ingest. |
| Headers | Security headers | CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, (optional HSTS). |
| Host Validation | TrustedHostMiddleware | Enforces explicit Host allowlist; container healthchecks send `Host: backend`. |
| Observability | Metrics & reasons | Prometheus gauges for health reasons, crypto state, Alembic divergence, build info. |
| Crypto | Envelope encryption (optional) | DEK wrapped by env KEK or GCP KMS; disabled state classified as informational, not failure. |
| Provenance | Build metadata | `GIT_BRANCH`, `GIT_COMMIT`, `BUILD_TIME` baked into image + `/version` endpoint. |

---
## 2. Container & Runtime Hardening Details
**Backend Image**
- Distroless runtime (no shell, curl, package tools).
- Dependencies installed in builder; only `site-packages` + app code copied forward.
- Python entrypoint (`run_app.py`) performs Alembic migrations (best‑effort) then launches Uvicorn.
- Non-root user; no writable root filesystem.

**Runtime Settings (Compose)**
- `read_only: true` limits mutation of image layers.
- `tmpfs` for short‑lived writable needs (`/tmp`, Nginx cache/run) with `noexec,nosuid,nodev` flags.
- `cap_drop: ALL` drastically narrows the kernel attack surface.
- `no-new-privileges:true` prevents privilege escalation.
- Optional: enable seccomp profile once validated.

**Nginx**
- Rate limiting differentiates bursts across auth, ingest, streaming.
- Security headers + CSP (self + inline styles, can be tightened with SRI later).
- `_up` endpoint proxies backend `/live` for external uptime monitors.

---
## 3. Network & Exposure
- Only Nginx is intended to face external traffic (typically via Cloudflare Tunnel / reverse proxy).
- Backend is *not* directly published (internal Docker network name `backend`).
- Health & readiness separation: `/live` (no DB/crypto) vs `/healthz` (full system checks).
- Strict Host enforcement reduces Host header poisoning and SSRF vectors relying on ambiguous routing.

---
## 4. Supply Chain & Build Integrity
Implemented:
- Multi‑stage build with explicit dependency installation step.
- Build args embed Git metadata + time.
- `.dockerignore` (root + backend) trims build context for deterministic layer hashing.
- Automated CI workflow (`.github/workflows/security-scan.yml`) running Hadolint, Trivy (FS + image), and Syft SBOM (CycloneDX + SPDX) with artifacts.

Recommended (future):
- Grype scan in addition to Trivy for supplemental vulnerability sources.
- Sigstore / Cosign signing (`cosign sign --key ...` and `cosign verify`).
- Dependency update automation with security diff review.

---
## 5. Application Security Controls
- **Host enforcement**: `TrustedHostMiddleware` activated under production environment conditions.
- **CORS**: strict allowlist via environment (`CORS_ALLOW_ORIGINS`).
- **Sessions & CSRF**: Double-submit cookie pattern, configurable `COOKIE_*` flags.
- **LLM gating**: Test overrides (`FORCE_HELP_LLM`) isolated; production safe defaults disallow unauthorized model fallback.
- **Health classification**: Reasons separated into `info` vs `warn` to prevent false container restarts.

---
## 6. Cryptography (Envelope Model)
- Sensitive columns encrypted with a Data Encryption Key (DEK).
- DEK wrapped by either:
  - Environment-supplied KEK (AES-GCM) — fastest bootstrap.
  - GCP KMS key for managed rotation & central policy.
- Disabled crypto is informational: system still serves non-sensitive endpoints without failing health.
- Rotation workflows present (`dek-rotate-*`, KEK rewrap).

---
## 7. Observability & Health Metrics
Prometheus gauges:
- `health_overall` (1 healthy / 0 degraded)
- `health_reason{reason,severity}` granular tracking
- `alembic_multiple_heads` migration drift early detection
- Crypto: `crypto_ready`, `crypto_mode_env`, `crypto_keys_total`, `crypto_active_label_age_seconds`
- `/version` exposes build provenance (branch, commit, timestamp)

---
## 8. Current Risk Trade‑offs / Non-Goals
| Area | Status / Rationale |
|------|--------------------|
| Seccomp | Placeholder only; not yet enforced (needs live test pass). |
| Image Signing | Not yet enabled; planned via Cosign. |
| SBOM Publishing | Not automated; manual generation recommended pre‑release. |
| Secrets Management | Docker secrets optional; local override may disable due to Windows bind issues. |
| Dependency Pinning | Requirements pinned where stability matters; periodic review needed. |
| CSP Tightening | Allows `'unsafe-inline'` styles for current UI; can be reduced with SRI + hashed styles. |

---
## 9. Recommended Next Steps
1. Enable seccomp profile in staging, observe for 7+ days, then promote to prod.
2. Extend CI pipeline: (lint) → (unit/integration tests) → (Trivy + Grype scans) → (SBOM) → (Sign + push).
3. Introduce automated dependency freshness audit (weekly) with security diff scanning.
4. Harden CSP (`style-src 'self'` only) after migrating inline styles.
5. Add runtime memory/cpu limits alert thresholds in Prometheus / Grafana.
6. Optionally implement fail2ban‑style dynamic ban in Nginx (if hostile traffic appears beyond rate limits).

---
## 10. Vulnerability Reporting
If you discover a potential vulnerability:
1. Do **NOT** open a public issue with exploit details.
2. Use GitHub's "Report a vulnerability" (Security Advisories) feature for this repository **OR** contact the repository owner via GitHub profile (direct message / listed email if available).
3. Provide: component, version/commit (`/version` endpoint output), reproduction steps, impact assessment, and suggested remediation (if known).
4. Expect acknowledgment within **5 business days**; coordinated disclosure timeline will be discussed (default target: fix or mitigation within 30 days for high severity).

Out-of-scope examples (unless they lead to real impact):
- Lack of rate limiting beyond existing configured thresholds.
- Denial of service via extremely large file uploads exceeding configured `client_max_body_size` (treated as config tuning).
- Use of test/dev environment flags intentionally enabled in non-production contexts.

---
## 11. Contact & Attribution
Primary maintainer: repository owner (`leok974`).
Please include the term "SECURITY" in any subject lines or advisory titles.

---
## 12. Revision Log
| Date | Change |
|------|--------|
| 2025-09-26 | Initial SECURITY.md added (distroless + runtime hardening baseline). |
| 2025-09-26 | Added hardened Nginx containers section & liveness separation. |
| 2025-11-05 | **SECURITY INCIDENT**: GCP Service Account key leaked - immediate remediation |

---

## 13. Security Incidents

### Secret Incident 2025-11-05

**Summary**: GCP Service Account key leaked in commit history

**Timeline**:
- **2025-11-05 (Detection)**: Service account key `gcp-dbt-sa.json` discovered in repository
- **Key ID**: `5b0a36412e9b3b7a019af3dcce31769f29126fd2`
- **Service Account**: `dbt-runner@ledgermind-ml-analytics.iam.gserviceaccount.com`

**Remediation Actions**:
1. ✅ GCP key disabled via `gcloud iam service-accounts keys disable`
2. ✅ GCP key deleted via `gcloud iam service-accounts keys delete`
3. ⏳ Git history rewrite with `git filter-repo --invert-paths --path gcp-dbt-sa.json`
4. ⏳ Force-push to remove key from all branches
5. ✅ GitHub Secret Scanning + Push Protection enabled
6. ✅ Pre-commit hooks hardened with gitleaks + detect-secrets
7. ✅ Migrated to OIDC (Workload Identity Federation) - no static keys
8. ✅ `.gitignore` updated with comprehensive SA key patterns

**Post-Incident Verification**:
- [ ] Confirm GCP key disabled & deleted
- [ ] Force-push performed after merge
- [ ] Secret scanning + push protection enabled
- [ ] Re-run CI green with OIDC
- [ ] Cloud Logging audit for suspicious activity
- [ ] GitHub Actions artifacts deleted for affected runs

**Root Cause**: Developer accidentally committed service account JSON during dbt setup.

**Prevention**:
- Pre-commit hooks now block all GCP service account keys
- GitHub push protection enabled
- All CI/CD migrated to OIDC (no static keys)
- `.gitignore` patterns strengthened
- Team training on credential management

---

## 14. No Static Keys Policy

**Effective 2025-11-05**: This repository does **not** allow static service account keys.

**For GCP Authentication**:
- Use Workload Identity Federation (OIDC) in GitHub Actions
- Store only `GCP_WIF_PROVIDER` in repo secrets (no JSON keys)
- Example: `.github/workflows/dbt-oidc.yml`

**For Local Development**:
- Use `gcloud auth application-default login` (ADC)
- Never commit `*-sa.json` or `*-credentials.json` files

### Pre-Commit Setup

```bash
# One-time setup
pip install pre-commit
pre-commit install

# Initialize detect-secrets baseline
detect-secrets scan > .secrets.baseline

# Verify
pre-commit run -a
```

### Emergency Key Rotation

If a key is leaked:

```bash
# 1. Disable immediately
SA_EMAIL="your-sa@project.iam.gserviceaccount.com"
KEY_ID="leaked-key-id"
gcloud iam service-accounts keys disable "$KEY_ID" --iam-account "$SA_EMAIL"

# 2. Delete permanently
gcloud iam service-accounts keys delete "$KEY_ID" --iam-account "$SA_EMAIL" --quiet

# 3. Audit usage
gcloud logging read "protoPayload.authenticationInfo.principalEmail=$SA_EMAIL" \
  --limit 100 --format json

# 4. Purge from Git (consult SECURITY.md incident procedure)
```

---
*Document generated to provide auditors, recruiters, and contributors a one‑page security posture snapshot. Keep concise; update when material controls change.*

---
## Appendix: Hardened Nginx Containers

This project employs a consistent hardening pattern for both the edge (reverse proxy) and static web (SPA) Nginx containers.

Key controls:
- Non-root runtime (UID/GID 101) with `cap_drop: ["ALL"]` and `security_opt: no-new-privileges:true`.
- Read-only root filesystem; writable needs isolated to tmpfs mounts:
  - `/var/cache/nginx` and `/var/run` mounted as `tmpfs` with `uid=101,gid=101,mode=0755,noexec,nosuid,nodev`.
  - Eliminates runtime `chown` and avoids requiring retained capabilities (e.g., `CAP_CHOWN`).
- Global `user` directive removed/commented to prevent warnings; container user controls privilege model.
- Split liveness semantics:
  - `/_up` returns `204` locally—pure container aliveness (fast, no upstream dependency).
  - `/_upstream` proxies backend `/live` for optional external uptime integration without flapping container health on backend restarts.
- Minimal healthchecks use busybox `wget` (present in `nginx:alpine`) and do not write files (safe under `read_only`).
- Explicit security headers applied centrally (CSP, X-Frame-Options, etc.). Static SPA adds immutable caching for hashed assets and `no-store` for `index.html`.

Benefits:
- Reduced attack surface (no root, no writable image layers, no ambient capabilities).
- Faster restarts and deterministic behavior (ephemeral cache + run dirs always clean).
- Clear separation of container vs upstream health lowers false-positive restarts.

Operational Notes:
- If adding new Nginx temp directories (e.g., enabling proxy cache), extend tmpfs mounts and pre-create paths during build or rely on correct ownership via mount options.
- For TLS termination inside the container, ensure certificates are mounted read-only; consider a distinct tmpfs for OCSP/SSL cache if required.
- Evaluate enabling a tight seccomp profile after capturing required syscalls under typical load (baseline with `strace` or `seccomp-exporter`).

Example Compose Snippet:
```
  web:
    user: "101:101"
    read_only: true
    cap_drop: ["ALL"]
    security_opt:
      - no-new-privileges:true
    tmpfs:
      - /var/cache/nginx:rw,noexec,nosuid,nodev,size=64m,uid=101,gid=101,mode=0755
      - /var/run:rw,noexec,nosuid,nodev,size=16m,uid=101,gid=101,mode=0755
    healthcheck:
      test: ["CMD-SHELL","wget -q -O /dev/null http://127.0.0.1:8080/_up || exit 1"]
      interval: 10s
      timeout: 3s
      retries: 10
      start_period: 20s
```

Future Enhancements:
- Add optional `/_metrics` internal endpoint (or sidecar) exporting Nginx stub status behind a network policy.
- Introduce automated conformance check (CI script) to flag Nginx services missing required hardening fields.
