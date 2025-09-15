from __future__ import annotations

from typing import Optional
from app.services.crypto import EnvelopeCrypto
import os, base64, time
from sqlalchemy import text
from sqlalchemy.orm import Session
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
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
    return AESGCM(base64.b64decode(kek)).decrypt(nonce, wrapped, b"dek")

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
        "SELECT dek_wrapped, dek_wrap_nonce FROM encryption_keys WHERE label=:l LIMIT 1"
    ), {"l": label}).first()
    if not row:
        raise RuntimeError(f"DEK not found for label {label!r}")
    dek = _unwrap_with_kek(row.dek_wrap_nonce, row.dek_wrapped)
    _deks[label] = dek
    return dek

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
    db: Session = next(get_db())
    db.execute(text(
        "INSERT INTO encryption_settings(id, write_label) VALUES (1, :l) "
        "ON CONFLICT (id) DO UPDATE SET write_label=:l, updated_at=NOW()"
    ), {"l": new_label})
    db.commit()
    _write_label_cache.update(label=new_label, ts=time.monotonic())
    try:
        _ = get_dek_for_label(new_label)
    except Exception:
        pass
