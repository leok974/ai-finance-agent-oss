from __future__ import annotations

import base64
import os
from datetime import date

import pytest
from sqlalchemy import text

from app.services.crypto import EnvelopeCrypto
from app.core.crypto_state import set_crypto, set_active_label, set_write_label
from app.orm_models import Transaction, EncryptionKey
from app.scripts.dek_rotation import begin_new_dek, rotation_status, run_rotation, finalize_rotation


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


@pytest.mark.rotation
def test_dek_rotation_finalize_smoke(db_session):
    # Stable KEK (ensure both env names point to same value)
    if not os.getenv("ENCRYPTION_MASTER_KEY_BASE64") and not os.getenv("MASTER_KEK_B64"):
        kek = base64.b64encode(os.urandom(32)).decode()
        os.environ.setdefault("ENCRYPTION_MASTER_KEY_BASE64", kek)
        os.environ.setdefault("MASTER_KEK_B64", kek)
    elif os.getenv("MASTER_KEK_B64") and not os.getenv("ENCRYPTION_MASTER_KEY_BASE64"):
        os.environ["ENCRYPTION_MASTER_KEY_BASE64"] = os.getenv("MASTER_KEK_B64")
    elif os.getenv("ENCRYPTION_MASTER_KEY_BASE64") and not os.getenv("MASTER_KEK_B64"):
        os.environ["MASTER_KEK_B64"] = os.getenv("ENCRYPTION_MASTER_KEY_BASE64")

    # Seed under active
    _ensure_key(db_session, "active")
    set_write_label("active")
    N = 3
    for i in range(N):
        t = Transaction(merchant_canonical=f"m{i}", amount=1 + i, date=date(2024, 1, 1+i))
        t.description_text = f"d{i}"
        db_session.add(t)
    db_session.commit()

    # Begin rotation
    new_label = begin_new_dek()
    set_write_label(new_label)

    # Status before run
    st0 = rotation_status(new_label)
    # Run non-dry to re-encrypt a batch
    out = run_rotation(new_label, batch_size=100, max_batches=1, dry_run=False)
    st1 = rotation_status(new_label)
    assert st1["label"] == new_label
    assert st1["total_cipher_rows"] >= st1["done"] >= 0
    # Delta: done should increase after a run (unless there were zero cipher rows)
    assert st1["done"] > st0["done"] or st0["total_cipher_rows"] == 0

    # Finalize labels
    retired, active = finalize_rotation(new_label)
    assert active == "active"

    # Flip write label back to active and insert one more
    set_write_label("active")
    t = Transaction(merchant_canonical="mx", amount=9, date=date(2024, 2, 1))
    t.description_text = "dx"
    db_session.add(t)
    db_session.commit()

    # All rows should be readable
    rows = db_session.query(Transaction).all()
    for r in rows:
        _ = r.description_text

    # Status callable after finalize (may report latest rotating label or error if none)
    st_final = rotation_status()
    assert isinstance(st_final, dict)
