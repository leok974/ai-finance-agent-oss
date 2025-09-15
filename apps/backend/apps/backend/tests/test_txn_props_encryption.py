from __future__ import annotations

import os
import pytest
from sqlalchemy import text

from app.orm_models import Transaction
from app.core.crypto_state import set_crypto, set_data_key
from app.services.crypto import EnvelopeCrypto


def setup_function(_):
    # fresh crypto state per test
    crypto = EnvelopeCrypto(os.urandom(32))
    set_crypto(crypto)
    set_data_key(EnvelopeCrypto.new_dek())


def test_description_text_roundtrip(db_session):
    t = Transaction(merchant_canonical="x", amount=1)
    t.description_text = "hello world"
    db_session.add(t)
    db_session.commit()
    db_session.refresh(t)
    got = db_session.get(Transaction, t.id)
    assert got.description_text == "hello world"
    assert got.description_nonce and got.description_enc


def test_tamper_raises(db_session):
    t = Transaction(merchant_canonical="x", amount=1)
    t.note_text = "secret"
    db_session.add(t)
    db_session.commit()
    db_session.refresh(t)
    row = db_session.execute(text("SELECT note_nonce, note_enc FROM transactions WHERE id=:i"), {"i": t.id}).first()
    nonce, enc = bytes(row[0]), bytearray(row[1])
    enc[-1] ^= 0xFF
    db_session.execute(text("UPDATE transactions SET note_enc=:e WHERE id=:i"), {"e": bytes(enc), "i": t.id})
    db_session.commit()
    with pytest.raises(Exception):
        _ = db_session.get(Transaction, t.id).note_text
