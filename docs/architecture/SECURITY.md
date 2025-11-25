# Security

Security architecture and best practices for LedgerMind.

---

## Encryption

### Envelope Encryption

Sensitive transaction fields use envelope encryption:

- **DEK (Data Encryption Key):** AES-256-GCM, stored encrypted
- **KEK (Key Encryption Key):** GCP KMS or env-based master key
- **AAD:** Additional authenticated data for context binding

**Encrypted fields:**
- `description`
- `merchant_raw`
- `note`

**See:** `docs/CRYPTO_SETUP.md` for KMS setup.

---

## Authentication

- **Method:** Session-based with httpOnly cookies
- **Password:** Bcrypt hashing
- **Sessions:** Secure, sameSite=lax

---

## CSRF Protection

All mutation endpoints require CSRF tokens.

---

## Content Security Policy (CSP)

Runtime hash-based CSP for inline scripts.

**Enforcement:**
- `script-src 'self' <sha256-hashes>`
- `style-src 'self' 'unsafe-inline'`

---

## SSRF Protection

LLM/agent endpoints use URL allowlists to prevent SSRF attacks.

---

## Secrets Management

- **Never commit:** `.env`, `secrets/`, SA JSON files
- **Docker secrets:** Use `/run/secrets/` mounts for production
- **Rotation:** Quarterly KEK/DEK rotation recommended

---

## Further Reading

- **KMS setup:** `../CRYPTO_SETUP.md`
- **Deployment:** [`../setup/PRODUCTION_SETUP.md`](../setup/PRODUCTION_SETUP.md)
