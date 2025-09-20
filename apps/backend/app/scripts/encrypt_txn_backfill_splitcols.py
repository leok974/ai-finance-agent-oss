from __future__ import annotations

"""
One-time backfill: plaintext -> encrypted enc/nonce columns on transactions.

Uses the Transaction hybrid properties (description_text, merchant_raw_text, note_text)
which perform AES-GCM encryption via the process DEK.
"""

from sqlalchemy.orm import Session
from app.db import get_db
from app.orm_models import Transaction
from app.core.crypto_state import set_crypto, set_active_label, set_data_key
from app.services.crypto import EnvelopeCrypto
import os


def _ensure_crypto_initialized():
    """
    Initialize crypto singleton similar to app startup.
    Ensures a persistent EncryptionKey row exists for the active label and
    loads the unwrapped DEK into process state. This avoids ephemeral DEKs
    so that separate processes can decrypt previously written data.
    """
    crypto = EnvelopeCrypto.from_env(os.environ)
    set_crypto(crypto)
    label = os.environ.get("ENCRYPTION_ACTIVE_LABEL", "active")
    set_active_label(label)
    # Ensure an EncryptionKey exists; create+persist if missing
    try:
        from app.orm_models import EncryptionKey
        from app.db import SessionLocal
        with SessionLocal() as s:
            ek = s.query(EncryptionKey).filter(EncryptionKey.label == label).one_or_none()
            if not ek:
                dek = EnvelopeCrypto.new_dek()
                wrapped, nonce = crypto.wrap_dek(dek)
                ek = EncryptionKey(label=label, dek_wrapped=wrapped, dek_wrap_nonce=nonce)
                s.add(ek)
                s.commit()
            # unwrap DEK and cache in process (detect KMS by empty/None nonce)
            try:
                nonce = ek.dek_wrap_nonce
                if nonce is None or (isinstance(nonce, (bytes, bytearray)) and len(nonce) == 0):
                    from app.services.gcp_kms_wrapper import kms_unwrap_dek  # type: ignore
                    plain = kms_unwrap_dek(ek.dek_wrapped)
                else:
                    plain = crypto.unwrap_dek(ek.dek_wrapped, nonce)
                set_data_key(plain)
            except Exception as e:
                # If a key exists but unwrap fails, KEK is wrong; fail fast.
                raise RuntimeError("KEK mismatch while unwrapping DEK. Update ENCRYPTION_MASTER_KEY_BASE64 (or MASTER_KEK_B64) to current KEK.") from e
            return
    except RuntimeError:
        raise
    except Exception:
        # As a last resort, use an ephemeral DEK to keep script usable in dev when DB is unreachable
        set_data_key(EnvelopeCrypto.new_dek())


def run():
    _ensure_crypto_initialized()
    db: Session = next(get_db())
    n = 0
    for t in db.query(Transaction).yield_per(500):
        changed = False
        # Migrate legacy plaintext if still present and encrypted empty
        if hasattr(t, "description") and getattr(t, "description") and not t.description_enc:
            t.description_text = t.description
            try:
                t.description = None
            except Exception:
                pass
            changed = True

        if hasattr(t, "merchant") and getattr(t, "merchant") and not t.merchant_raw_enc:
            # if original project had merchant_raw, adapt here; using merchant as best-effort
            t.merchant_raw_text = t.merchant
            changed = True

        if hasattr(t, "note") and getattr(t, "note") and not t.note_enc:
            t.note_text = t.note
            # Keep t.note if still used elsewhere; comment to clear if desired.
            changed = True

        if changed:
            n += 1
            if n % 500 == 0:
                db.flush()
    db.commit()
    print({"encrypted": n})


if __name__ == "__main__":
    run()
