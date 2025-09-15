import os, base64, datetime
from typing import Optional, Tuple
from sqlalchemy import text
from sqlalchemy.orm import Session
from app.db import get_db
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

AAD = b"txn:v1"


def _kek_b64() -> str:
    return (os.getenv("MASTER_KEK_B64") or os.getenv("ENCRYPTION_MASTER_KEY_BASE64") or "").strip()


def _unwrap_dek(dek_wrap_nonce: bytes, dek_wrapped: bytes) -> bytes:
    kek = _kek_b64()
    if not kek:
        raise RuntimeError("KEK env not set (MASTER_KEK_B64 / ENCRYPTION_MASTER_KEY_BASE64)")
    return AESGCM(base64.b64decode(kek)).decrypt(dek_wrap_nonce, dek_wrapped, b"dek")


def begin_new_dek(label: Optional[str] = None) -> str:
    """Create a new DEK and insert into encryption_keys with label 'rotating::<ts>' (or provided)."""
    kek = _kek_b64()
    if not kek:
        raise RuntimeError("KEK env not set")
    now = datetime.datetime.utcnow().strftime("%Y%m%d%H%M%S")
    new_label = label or f"rotating::{now}"

    new_dek = os.urandom(32)
    nonce = os.urandom(12)
    wrapped = AESGCM(base64.b64decode(kek)).encrypt(nonce, new_dek, b"dek")

    db: Session = next(get_db())
    db.execute(text(
        """
        INSERT INTO encryption_keys(label, dek_wrapped, dek_wrap_nonce, created_at)
        VALUES(:l, :w, :n, NOW())
        """
    ), {"l": new_label, "w": wrapped, "n": nonce})
    db.commit()
    return new_label


def finalize_rotation(new_label: str) -> Tuple[str, str]:
    """Rename labels: current active -> retired::<ts>, new_label -> active."""
    now = datetime.datetime.utcnow().strftime("%Y%m%d%H%M%S")
    retired_label = f"retired::{now}"
    db: Session = next(get_db())
    db.execute(text("UPDATE encryption_keys SET label=:ret WHERE label='active'"), {"ret": retired_label})
    db.execute(text("UPDATE encryption_keys SET label='active' WHERE label=:nl"), {"nl": new_label})
    db.commit()
    return retired_label, "active"


def rotation_status(new_label: Optional[str] = None) -> dict:
    """Return counts of encrypted rows that are done/remaining for a given new_label (or latest rotating::)."""
    db: Session = next(get_db())
    if not new_label:
        row = db.execute(text("SELECT label FROM encryption_keys WHERE label LIKE 'rotating::%' ORDER BY created_at DESC LIMIT 1")).first()
        if not row:
            return {"error": "no rotating label found"}
        new_label = row.label

    tot = db.execute(text(
        """
        SELECT COUNT(*) FROM transactions t
        WHERE t.description_enc IS NOT NULL OR t.merchant_raw_enc IS NOT NULL OR t.note_enc IS NOT NULL
        """
    )).scalar() or 0

    done = db.execute(text(
        """
        SELECT COUNT(*) FROM transactions t
        WHERE (t.description_enc IS NOT NULL OR t.merchant_raw_enc IS NOT NULL OR t.note_enc IS NOT NULL)
          AND t.enc_label = :nl
        """
    ), {"nl": new_label}).scalar() or 0

    return {"label": new_label, "total_cipher_rows": int(tot), "done": int(done), "remaining": int(tot - done)}


def run_rotation(new_label: str, batch_size: int = 1000, max_batches: int = 0, dry_run: bool = False) -> dict:
    """Rotate in batches. If max_batches==0, run a single batch. Returns progress dict."""
    db: Session = next(get_db())

    old = db.execute(text("SELECT id, dek_wrapped, dek_wrap_nonce FROM encryption_keys WHERE label='active' ORDER BY created_at DESC LIMIT 1")).first()
    if not old:
        raise RuntimeError("active DEK not found")
    new = db.execute(text("SELECT id, dek_wrapped, dek_wrap_nonce FROM encryption_keys WHERE label=:l LIMIT 1"), {"l": new_label}).first()
    if not new:
        raise RuntimeError(f"new DEK label not found: {new_label}")

    old_dek = _unwrap_dek(old.dek_wrap_nonce, old.dek_wrapped)
    new_dek = _unwrap_dek(new.dek_wrap_nonce, new.dek_wrapped)

    aes_old = AESGCM(old_dek)
    aes_new = AESGCM(new_dek)

    processed = 0
    batches = 0
    while True:
        rows = db.execute(text(
            """
            SELECT id, description_nonce, description_enc,
                   merchant_raw_nonce, merchant_raw_enc,
                   note_nonce, note_enc, enc_label
            FROM transactions
            WHERE (description_enc IS NOT NULL OR merchant_raw_enc IS NOT NULL OR note_enc IS NOT NULL)
              AND (enc_label IS NULL OR enc_label <> :nl)
            ORDER BY id ASC
            LIMIT :lim
            """
        ), {"nl": new_label, "lim": batch_size}).fetchall()

        if not rows:
            break

        for r in rows:
            updates = {}
            try:
                if r.description_enc is not None and r.description_nonce is not None:
                    pt = aes_old.decrypt(r.description_nonce, r.description_enc, AAD)
                    if not dry_run:
                        nd_nonce = os.urandom(12)
                        nd_ct = aes_new.encrypt(nd_nonce, pt, AAD)
                        updates["description_nonce"] = nd_nonce
                        updates["description_enc"] = nd_ct
                if r.merchant_raw_enc is not None and r.merchant_raw_nonce is not None:
                    pt = aes_old.decrypt(r.merchant_raw_nonce, r.merchant_raw_enc, AAD)
                    if not dry_run:
                        nm_nonce = os.urandom(12)
                        nm_ct = aes_new.encrypt(nm_nonce, pt, AAD)
                        updates["merchant_raw_nonce"] = nm_nonce
                        updates["merchant_raw_enc"] = nm_ct
                if r.note_enc is not None and r.note_nonce is not None:
                    pt = aes_old.decrypt(r.note_nonce, r.note_enc, AAD)
                    if not dry_run:
                        nn_nonce = os.urandom(12)
                        nn_ct = aes_new.encrypt(nn_nonce, pt, AAD)
                        updates["note_nonce"] = nn_nonce
                        updates["note_enc"] = nn_ct

                if not dry_run and updates:
                    sets = ", ".join([f"{k} = :{k}" for k in updates.keys()]) + ", enc_label = :nl"
                    db.execute(text(f"UPDATE transactions SET {sets} WHERE id = :id"), {**updates, "nl": new_label, "id": r.id})
                    processed += 1
            except Exception:
                # skip problematic rows; could log an audit record here
                pass

        db.commit()
        batches += 1
        if max_batches and batches >= max_batches:
            break

    st = rotation_status(new_label)
    st.update({"processed_this_run": processed, "batches": batches})
    return st
