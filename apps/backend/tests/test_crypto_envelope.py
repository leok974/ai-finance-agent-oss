from app.services.crypto import EnvelopeCrypto
import base64
import pytest


def test_roundtrip_encrypt_decrypt():
    kek = b"k" * 32
    crypto = EnvelopeCrypto(kek)
    dek = EnvelopeCrypto.new_dek()
    wrapped, nonce = crypto.wrap_dek(dek)
    unwrapped = crypto.unwrap_dek(wrapped, nonce)
    assert unwrapped == dek

    msg = b"hello world"
    ct, n2 = crypto.aesgcm_encrypt(dek, msg)
    pt = crypto.aesgcm_decrypt(dek, ct, n2)
    assert pt == msg


def test_tamper_detection():
    kek = b"k" * 32
    crypto = EnvelopeCrypto(kek)
    dek = EnvelopeCrypto.new_dek()
    ct, n = crypto.aesgcm_encrypt(dek, b"secret")
    bad = bytearray(ct)
    bad[-1] ^= 0x01
    with pytest.raises(Exception):
        crypto.aesgcm_decrypt(dek, bytes(bad), n)
