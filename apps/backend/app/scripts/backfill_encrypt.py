"""
Encrypt existing plaintext fields into encrypted columns.

Fields:
 - transactions.merchant -> merchant_raw_enc/merchant_raw_nonce
 - transactions.description -> description_enc/description_nonce
 - transactions.note -> note_enc/note_nonce

Skips rows already having enc_label set.
"""

from __future__ import annotations

import os
from sqlalchemy.orm import Session
from app.db import SessionLocal
from app.orm_models import Transaction, EncryptionKey
from app.utils.crypto_state import state as crypto_state
from app.services.crypto import EnvelopeCrypto


def _ensure_active_key(session: Session, crypto: EnvelopeCrypto) -> EncryptionKey:
    label = crypto_state.active_label
    ek = session.query(EncryptionKey).filter(EncryptionKey.label == label).one_or_none()
    if not ek:
        dek = EnvelopeCrypto.new_dek()
        wrapped, nonce = crypto.wrap_dek(dek)
        ek = EncryptionKey(label=label, dek_wrapped=wrapped, dek_wrap_nonce=nonce)
        session.add(ek)
        session.commit()
    return ek


def _active_dek(session: Session, crypto: EnvelopeCrypto) -> bytes:
    ek = _ensure_active_key(session, crypto)
    try:
        return crypto.unwrap_dek(ek.dek_wrapped, ek.dek_wrap_nonce)
    except Exception:
        # Dev recovery: if an EK exists but can't be unwrapped (different KEK), replace it.
        dek = EnvelopeCrypto.new_dek()
        wrapped, nonce = crypto.wrap_dek(dek)
        ek.dek_wrapped = wrapped
        ek.dek_wrap_nonce = nonce
        session.commit()
        return dek


def run(limit: int | None = None) -> int:
    updated = 0
    with SessionLocal() as s:
        crypto = crypto_state.crypto or EnvelopeCrypto.from_env(os.environ)
        dek = _active_dek(s, crypto)
        q = s.query(Transaction).filter(Transaction.enc_label.is_(None))
        if limit:
            q = q.limit(limit)
        for t in q.all():
            # merchant
            if t.merchant is not None:
                ct, nonce = crypto.aesgcm_encrypt(dek, t.merchant.encode("utf-8"))
                t.merchant_raw_enc = ct
                t.merchant_raw_nonce = nonce
            # description
            if t.description is not None:
                ct, nonce = crypto.aesgcm_encrypt(dek, t.description.encode("utf-8"))
                t.description_enc = ct
                t.description_nonce = nonce
            # note
            if t.note is not None:
                ct, nonce = crypto.aesgcm_encrypt(dek, t.note.encode("utf-8"))
                t.note_enc = ct
                t.note_nonce = nonce
            t.enc_label = crypto_state.active_label
            updated += 1
        s.commit()
    return updated


if __name__ == "__main__":
    n = run()
    print({"updated": n})
