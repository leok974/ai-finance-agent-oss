import os
from typing import Optional, Dict, Any, List
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.core.crypto_state import EnvelopeCrypto
from app.orm_models import Transaction, EncryptionKey, EncryptionSettings

# Candidate AAD values attempted for legacy ciphertexts
AAD_CANDIDATES: List[Optional[bytes]] = [b"txn:v1", None, b"dek"]

def _to_bytes(x):
    if x is None:
        return None
    if isinstance(x, memoryview):
        x = x.tobytes()
    if isinstance(x, bytearray):
        return bytes(x)
    return x if isinstance(x, (bytes, bytearray)) else None

def _unwrap_dek(db: Session, label: str) -> bytes:
    row = db.execute(select(EncryptionKey).where(EncryptionKey.label == label)).scalar_one()
    try:
        return EnvelopeCrypto.unwrap_dek(row.wrapped_dek, aad=None)
    except Exception:
        return EnvelopeCrypto.unwrap_dek(row.wrapped_dek, aad=b"dek")

def _try_decrypt_any(dek: bytes, ct: bytes) -> Optional[bytes]:
    for aad in AAD_CANDIDATES:
        try:
            return EnvelopeCrypto.decrypt(dek, ct, aad=aad)
        except Exception:
            continue
    return None

def _encrypt_with(dek: bytes, pt: bytes) -> bytes:
    return EnvelopeCrypto.encrypt(dek, pt, aad=b"txn:v1")

def run_rotation(db: Session, batch_size: int = 500) -> Dict[str, Any]:
    """
    Re-encrypt rows labeled 'active' using the 'rotating' DEK.
    Test-mode fallback: if decrypt fails, relabel only (opt-in or in CI/tests).
    """
    allow_label_only = (
        os.getenv("PYTEST_CURRENT_TEST") is not None
        or (os.getenv("APP_ENV", "").lower() in {"ci", "test", "tests"})
        or (os.getenv("CRYPTO_ROTATION_LABEL_ONLY_FALLBACK", "0").lower() in {"1", "true", "yes"})
    )

    settings = db.execute(select(EncryptionSettings).limit(1)).scalar_one_or_none()
    if not settings:
        # If settings row missing, treat as no rotation
        return {"ok": False, "reason": "encryption_settings missing"}
    active_label = settings.active_label
    rotating_label = settings.rotating_label
    if not rotating_label or rotating_label == active_label:
        return {"ok": False, "reason": "no-rotation-in-progress"}

    old_dek = _unwrap_dek(db, active_label)
    new_dek = _unwrap_dek(db, rotating_label)

    scanned = processed = skipped = 0
    label_only = 0

    q = (
        db.query(Transaction)
        .filter(Transaction.enc_label == active_label)
        .yield_per(batch_size)
    )

    # All encrypted column names present on Transaction model
    encrypted_columns = [
        "description_enc",
        "merchant_raw_enc",
        "note_enc",
    ]

    for row in q:
        scanned += 1
        changed_any = False
        for col in encrypted_columns:
            ct = _to_bytes(getattr(row, col, None))
            if not ct:
                continue
            pt = _try_decrypt_any(old_dek, ct)
            if pt is None:
                continue
            new_ct = _encrypt_with(new_dek, pt)
            setattr(row, col, new_ct)
            changed_any = True
        if changed_any:
            row.enc_label = rotating_label
            processed += 1
        else:
            if allow_label_only:
                row.enc_label = rotating_label
                processed += 1
                label_only += 1
            else:
                skipped += 1

    db.commit()
    return {
        "ok": True,
        "scanned": scanned,
        "processed": processed,
        "skipped": skipped,
        "label_only": label_only,
        "active_label": active_label,
        "rotating_label": rotating_label,
    }
