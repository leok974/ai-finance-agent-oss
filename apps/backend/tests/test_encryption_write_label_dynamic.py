from __future__ import annotations

import base64
import os
from datetime import date

import pytest

from app.services.crypto import EnvelopeCrypto
from app.core.crypto_state import set_crypto, set_active_label, set_write_label
from app.orm_models import Transaction, EncryptionKey


@pytest.fixture(autouse=True)
def _seed_kek_env(monkeypatch):
    # Stable KEK for test determinism
    os.environ.setdefault(
        "ENCRYPTION_MASTER_KEY_BASE64", base64.b64encode(os.urandom(32)).decode()
    )
    yield


def _ensure_key(db, label: str) -> None:
    crypto = EnvelopeCrypto.from_env(os.environ)
    set_crypto(crypto)
    set_active_label("active")
    ek = db.query(EncryptionKey).filter(EncryptionKey.label == label).one_or_none()
    if not ek:
        dek = EnvelopeCrypto.new_dek()
        wrapped, nonce = crypto.wrap_dek(dek)
        ek = EncryptionKey(label=label, dek_wrapped=wrapped, dek_wrap_nonce=nonce)
        db.add(ek)
        db.commit()


@pytest.mark.crypto
def test_dynamic_write_label_roundtrip(db_session):
    # Prepare two labels: active and rotating
    _ensure_key(db_session, "active")
    _ensure_key(db_session, "rotating::test")

    # Set write_label to active via API (updates cache + DB)
    set_write_label("active")

    # Write a row under 'active'
    t1 = Transaction(merchant_canonical="m1", amount=1.0, date=date(2024, 1, 1))
    t1.description_text = "d1"
    db_session.add(t1)
    db_session.commit()
    db_session.refresh(t1)
    assert t1.enc_label == "active"

    # Flip write_label to rotating and write another row
    set_write_label("rotating::test")

    t2 = Transaction(merchant_canonical="m2", amount=2.0, date=date(2024, 1, 2))
    t2.description_text = "d2"
    db_session.add(t2)
    db_session.commit()
    db_session.refresh(t2)
    assert t2.enc_label == "rotating::test"

    # Read back both and ensure decryption works per-row label
    got1 = db_session.get(Transaction, t1.id)
    got2 = db_session.get(Transaction, t2.id)
    assert got1.description_text == "d1"
    assert got2.description_text == "d2"
