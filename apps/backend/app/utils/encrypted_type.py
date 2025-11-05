from __future__ import annotations

from sqlalchemy.types import TypeDecorator, LargeBinary
from app.core.crypto_state import get_crypto, get_data_key


class EncryptedStr(TypeDecorator):
    impl = LargeBinary
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        # Encrypt with active DEK; store nonce||ciphertext
        dek = get_data_key()
        ct, nonce = get_crypto().aesgcm_encrypt(
            dek, value.encode("utf-8"), aad=b"txn:v1"
        )
        return nonce + ct

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        dek = get_data_key()
        nonce, ct = value[:12], value[12:]
        pt = get_crypto().aesgcm_decrypt(dek, ct, nonce, aad=b"txn:v1")
        return pt.decode("utf-8")
