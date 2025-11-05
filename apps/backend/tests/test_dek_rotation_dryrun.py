from __future__ import annotations

import base64
import os
from datetime import date


from app.services.crypto import EnvelopeCrypto
from app.core.crypto_state import set_crypto, set_active_label, set_write_label
from app.orm_models import Transaction, EncryptionKey
from app.scripts.dek_rotation import begin_new_dek, rotation_status, run_rotation


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


import pytest


@pytest.mark.rotation
def test_dek_rotation_dryrun_smoke(db_session):
    # Seed KEK for determinism (mirror to MASTER_KEK_B64 to satisfy unwrap paths referencing either)
    if not os.getenv("ENCRYPTION_MASTER_KEY_BASE64") and not os.getenv(
        "MASTER_KEK_B64"
    ):
        kek = base64.b64encode(os.urandom(32)).decode()
        os.environ.setdefault("ENCRYPTION_MASTER_KEY_BASE64", kek)
        os.environ.setdefault("MASTER_KEK_B64", kek)
    elif os.getenv("MASTER_KEK_B64") and not os.getenv("ENCRYPTION_MASTER_KEY_BASE64"):
        os.environ["ENCRYPTION_MASTER_KEY_BASE64"] = os.getenv("MASTER_KEK_B64")
    elif os.getenv("ENCRYPTION_MASTER_KEY_BASE64") and not os.getenv("MASTER_KEK_B64"):
        os.environ["MASTER_KEK_B64"] = os.getenv("ENCRYPTION_MASTER_KEY_BASE64")

    # Ensure active key exists and seed a few rows under 'active'
    _ensure_key(db_session, "active")
    set_write_label("active")
    for i in range(3):
        t = Transaction(
            merchant_canonical=f"m{i}", amount=1 + i, date=date(2024, 1, 1 + i)
        )
        t.description_text = f"d{i}"
        db_session.add(t)
    db_session.commit()

    # Begin rotation -> create new DEK label
    new_label = begin_new_dek()
    set_write_label(new_label)

    st0 = rotation_status(new_label)
    out = run_rotation(new_label, batch_size=100, max_batches=1, dry_run=True)
    st1 = rotation_status(new_label)

    # Delta invariants under dry-run
    assert st0["total_cipher_rows"] == st1["total_cipher_rows"]
    assert st0["done"] == st1["done"]
    assert out["batches"] == 1
