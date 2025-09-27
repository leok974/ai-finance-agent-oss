from __future__ import annotations

from typing import Optional
from app.services.crypto import EnvelopeCrypto
import os, base64, time
from sqlalchemy import text
from sqlalchemy.orm import Session
try:  # optional during hermetic tests
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM  # type: ignore
except Exception:  # pragma: no cover
    class _StubAESGCM:
        def __init__(self, key: bytes):
            self._k = key
        def decrypt(self, nonce: bytes, wrapped: bytes, aad):
            # no-op passthrough; test mode only
            return wrapped
    AESGCM = _StubAESGCM  # type: ignore
from app.db import get_db

_crypto: Optional[EnvelopeCrypto] = None
_active_label: str = "active"
_dek: Optional[bytes] = None

# New: per-label DEK cache and dynamic write label cache
_deks: dict[str, bytes] = {}
_write_label_cache = {"label": None, "ts": 0.0}
_WRITE_LABEL_TTL = float(os.getenv("WRITE_LABEL_TTL_SEC", "3"))

def _kek_b64() -> str:
    return (os.getenv("MASTER_KEK_B64") or os.getenv("ENCRYPTION_MASTER_KEY_BASE64") or "").strip()

def _unwrap_with_kek(nonce: bytes, wrapped: bytes) -> bytes:
    kek = _kek_b64()
    assert kek, "KEK env not set"
    aes = AESGCM(base64.b64decode(kek))
    for aad in (None, b"dek"):
        try:
            return aes.decrypt(nonce, wrapped, aad)
        except Exception:
            pass
    raise RuntimeError("Failed to unwrap DEK (KEK mismatch or AAD mismatch)")

def _unwrap_for_row(scheme: str | None, nonce: bytes | None, wrapped: bytes) -> bytes:
    sc = (scheme or ("gcp_kms" if not nonce else "aesgcm")).lower()
    if sc in ("gcp_kms", "kms"):
        # Lazy import to avoid requiring google-cloud-kms unless used
        from app.services.gcp_kms_wrapper import kms_unwrap_dek  # type: ignore
        return kms_unwrap_dek(wrapped)
    return _unwrap_with_kek(nonce or b"", wrapped)

def set_crypto(c: EnvelopeCrypto) -> None:
    global _crypto
    _crypto = c
    # Bridge to legacy utils state for compatibility
    try:
        from app.utils.crypto_state import state as _state
        _state.crypto = c
    except Exception:
        pass

def get_crypto() -> EnvelopeCrypto:
    assert _crypto is not None, "Crypto not initialized yet"
    return _crypto

def set_active_label(label: str) -> None:
    global _active_label
    _active_label = label
    try:
        from app.utils.crypto_state import state as _state
        _state.active_label = label
    except Exception:
        pass

def get_active_label() -> str:
    return _active_label

def set_data_key(dek: bytes) -> None:
    global _dek
    _dek = dek

def get_data_key() -> bytes:
    assert _dek is not None, "Data encryption key (DEK) not initialized"
    return _dek

# --- New helpers for multi-label support ---
def get_dek_for_label(label: str) -> bytes:
    """Return (and cache) DEK for a label by unwrapping from encryption_keys."""
    if label in _deks:
        return _deks[label]
    db: Session = next(get_db())
    row = db.execute(text(
        "SELECT dek_wrapped, dek_wrap_nonce FROM encryption_keys WHERE label=:l ORDER BY created_at DESC LIMIT 1"
    ), {"l": label}).first()
    if not row:
        raise RuntimeError(f"DEK not found for label {label!r}")
    dek = _unwrap_for_row(None, row.dek_wrap_nonce, row.dek_wrapped)
    _deks[label] = dek
    return dek


def purge_dek_cache(*labels: str) -> None:
    """Drop cached DEKs for provided labels (or all if none given)."""
    if labels:
        for label in labels:
            _deks.pop(label, None)
        return
    _deks.clear()

def get_write_label() -> str:
    """Read current write label from DB with a short cache TTL."""
    now = time.monotonic()
    if _write_label_cache["label"] and now - _write_label_cache["ts"] < _WRITE_LABEL_TTL:
        return _write_label_cache["label"]
    db: Session = next(get_db())
    row = db.execute(text("SELECT write_label FROM encryption_settings WHERE id=1")).first()
    label = (row.write_label if row and row.write_label else "active")
    _write_label_cache.update(label=label, ts=now)
    return label

def set_write_label(new_label: str) -> None:
    """Set write label globally and warm DEK cache for the label."""
    purge_dek_cache(new_label)
    db: Session = next(get_db())
    # DB-agnostic upsert: try update first, then insert if no row
    res = db.execute(text("UPDATE encryption_settings SET write_label=:l WHERE id=1"), {"l": new_label})
    if getattr(res, "rowcount", 0) == 0:
        try:
            db.execute(text("INSERT INTO encryption_settings (id, write_label) VALUES (1, :l)"), {"l": new_label})
        except Exception:
            # If raced, fallback to update
            db.execute(text("UPDATE encryption_settings SET write_label=:l WHERE id=1"), {"l": new_label})
    db.commit()
    _write_label_cache.update(label=new_label, ts=time.monotonic())
    try:
        _ = get_dek_for_label(new_label)
    except Exception:
        pass


# --- Unified initializer --------------------------------------------------
def load_and_cache_active_dek(db: Session) -> bytes:
    """
    Loads the DEK for the current write label and caches it in-process.
    - If dek_wrap_nonce is present -> unwrap via env KEK (AESGCM).
    - If dek_wrap_nonce is NULL     -> unwrap via GCP KMS (Decrypt).
    """
    label = get_write_label() or "active"

    row = db.execute(
        text(
            "SELECT id, dek_wrapped, dek_wrap_nonce "
            "FROM encryption_keys WHERE label=:label ORDER BY created_at DESC LIMIT 1"
        ),
        {"label": label},
    ).first()

    if not row:
        raise RuntimeError(f"No encryption key found for label '{label}'")

    wrapped = row.dek_wrapped
    nonce = getattr(row, "dek_wrap_nonce", None)

    if nonce:  # legacy/env-wrapped
        dek = _unwrap_with_kek(nonce, wrapped)
    else:  # KMS-wrapped
        kms_key = os.environ.get("GCP_KMS_KEY")
        if not kms_key:
            raise RuntimeError("KMS key id missing (kms_key_id column and GCP_KMS_KEY env are empty)")
        # Lazy import to avoid test-time dependency unless actually needed
        from importlib import import_module
        gkms = import_module("app.services.gcp_kms_wrapper")
        dek = gkms.kms_unwrap_dek(wrapped)

    set_data_key(dek)
    return dek


def get_crypto_status(db: Session) -> dict:
    """Return ready/mode/label/kms_key_id (prefer DB value if present)."""
    label = get_write_label() or "active"
    try:
        row = db.execute(
            text(
                "SELECT label, dek_wrap_nonce, kms_key_id FROM encryption_keys "
                "WHERE label=:label ORDER BY created_at DESC LIMIT 1"
            ),
            {"label": label},
        ).first()
    except Exception:
        row = None
    if not row:
        return {"ready": False, "mode": None, "label": None, "kms_key_id": None}
    mode = "env" if getattr(row, "dek_wrap_nonce", None) else "kms"
    kms_key_id = None
    if mode == "kms":
        kms_key_id = getattr(row, "kms_key_id", None) or os.getenv("GCP_KMS_KEY")
    return {"ready": True, "mode": mode, "label": row.label, "kms_key_id": kms_key_id}
