from __future__ import annotations

import os
from sqlalchemy import Column, Integer, create_engine
from sqlalchemy.orm import declarative_base, Session

from app.utils.encrypted_type import EncryptedStr
from app.services.crypto import EnvelopeCrypto
from app.core.crypto_state import set_crypto, set_data_key
from cryptography.exceptions import InvalidTag


Base = declarative_base()


class Secret(Base):
    __tablename__ = "secrets_test"
    id = Column(Integer, primary_key=True)
    secret = Column(EncryptedStr)


def setup_function(_fn):
    # fresh crypto state per test
    kek = os.urandom(32)
    crypto = EnvelopeCrypto(kek)
    set_crypto(crypto)
    set_data_key(EnvelopeCrypto.new_dek())


def test_encrypted_type_roundtrip():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    with Session(engine) as s:
        obj = Secret(secret="hello world")
        s.add(obj)
        s.commit()
        sid = obj.id
    with Session(engine) as s:
        got = s.get(Secret, sid)
        assert got.secret == "hello world"


def test_encrypted_type_tamper_detect():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    with Session(engine) as s:
        obj = Secret(secret="hello")
        s.add(obj)
        s.commit()
        sid = obj.id
    # tamper with stored ciphertext
    with engine.begin() as conn:
        row = conn.exec_driver_sql("select secret from secrets_test where id=1").fetchone()
        blob: bytes = row[0]
        tampered = blob[:-1] + bytes([blob[-1] ^ 0x01])
        conn.exec_driver_sql("update secrets_test set secret=? where id=1", (tampered,))
    with Session(engine) as s:
        try:
            _ = s.get(Secret, sid).secret
            assert False, "Expected InvalidTag"
        except InvalidTag:
            pass
