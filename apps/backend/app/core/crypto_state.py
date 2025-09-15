from __future__ import annotations

from typing import Optional
from app.services.crypto import EnvelopeCrypto

_crypto: Optional[EnvelopeCrypto] = None
_active_label: str = "active"
_dek: Optional[bytes] = None

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
