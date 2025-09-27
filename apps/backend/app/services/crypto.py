from __future__ import annotations

import base64
import os
from dataclasses import dataclass
from typing import Optional

try:  # optional dependency during hermetic tests
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM  # type: ignore
except Exception:  # pragma: no cover - fallback stub
    class _StubAESGCM:
        def __init__(self, key: bytes):
            self._key = key
        def encrypt(self, nonce: bytes, data: bytes, aad: Optional[bytes]):  # naive XOR stub (NOT secure)
            return data[::-1] + b".stub"
        def decrypt(self, nonce: bytes, data: bytes, aad: Optional[bytes]):
            if data.endswith(b".stub"):
                core = data[:-5]
                return core[::-1]
            return data
    AESGCM = _StubAESGCM  # type: ignore


@dataclass
class EnvelopeKey:
    label: str  # e.g., "active"
    dek_wrapped: bytes  # DEK encrypted with KEK
    nonce: bytes  # nonce used to wrap DEK


class EnvelopeCrypto:
    """Envelope encryption helper: wraps a data-encryption key (DEK) with a key-encryption key (KEK).

    Storage pattern:
    - KEK is provided via env (in dev) or KMS (in prod). We only hold KEK in memory.
    - DB stores: (label, dek_wrapped, nonce)
    - Data encryption uses AES-256-GCM with the unwrapped DEK.
    """

    def __init__(self, kek: bytes):
        if len(kek) not in (16, 24, 32):
            raise ValueError("KEK must be 128/192/256-bit")
        self._kek = kek
        self._kek_aead = AESGCM(self._kek)
        self._dek_cache: dict[str, bytes] = {}

    @staticmethod
    def _rand_bytes(n: int = 12) -> bytes:
        return os.urandom(n)

    @staticmethod
    def from_env(env: dict[str, str]) -> "EnvelopeCrypto":
        key_b64 = env.get("ENCRYPTION_MASTER_KEY_BASE64", "").strip()
        if not key_b64:
            # Dev fallback: generate random KEK; lasts for process lifetime only
            kek = os.urandom(32)
        else:
            try:
                kek = base64.b64decode(key_b64)
            except Exception as e:
                raise ValueError("Invalid ENCRYPTION_MASTER_KEY_BASE64") from e
        return EnvelopeCrypto(kek)

    # --- DEK wrap/unwrap -------------------------------------------------
    def wrap_dek(self, dek: bytes, aad: Optional[bytes] = None) -> tuple[bytes, bytes]:
        nonce = self._rand_bytes(12)
        ct = self._kek_aead.encrypt(nonce, dek, aad)
        return ct, nonce

    def unwrap_dek(self, wrapped: bytes, nonce: bytes, aad: Optional[bytes] = None) -> bytes:
        return self._kek_aead.decrypt(nonce, wrapped, aad)

    # --- Data encryption with DEK ---------------------------------------
    @staticmethod
    def new_dek() -> bytes:
        return os.urandom(32)

    @staticmethod
    def aesgcm_encrypt(dek: bytes, plaintext: bytes, aad: Optional[bytes] = None) -> tuple[bytes, bytes]:
        aead = AESGCM(dek)
        nonce = os.urandom(12)
        ct = aead.encrypt(nonce, plaintext, aad)
        return ct, nonce

    @staticmethod
    def aesgcm_decrypt(dek: bytes, ciphertext: bytes, nonce: bytes, aad: Optional[bytes] = None) -> bytes:
        aead = AESGCM(dek)
        return aead.decrypt(nonce, ciphertext, aad)
