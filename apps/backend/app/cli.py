import os, sys, argparse, base64
from app.utils.time import utc_now, utc_iso
os.environ.setdefault("PYTHONPATH","/app")

from app.db import get_db
from sqlalchemy.orm import Session
from sqlalchemy import text

# Initializer ensures encryption_keys row exists + caches DEK
from app.scripts.encrypt_txn_backfill_splitcols import _ensure_crypto_initialized
from app.scripts.dek_rotation import begin_new_dek, run_rotation, finalize_rotation, rotation_status
from app.core.crypto_state import set_write_label, get_write_label


def cmd_crypto_init(args):
    db: Session = next(get_db())
    ok = False
    try:
        from app.core.crypto_state import load_and_cache_active_dek
        load_and_cache_active_dek(db)
        ok = True
    except Exception as e1:
        try:
            _ensure_crypto_initialized()
            ok = True
        except Exception as e2:
            msg = (str(e2) or str(e1) or "").lower()
            if "kek mismatch" in msg:
                # If the DB has no encrypted transaction rows, we can safely create a fresh active DEK
                enc_rows = db.execute(text(
                    """
                    SELECT COUNT(*) FROM transactions t
                    WHERE t.description_enc IS NOT NULL OR t.merchant_raw_enc IS NOT NULL OR t.note_enc IS NOT NULL
                    """
                )).scalar() or 0
                if enc_rows == 0:
                    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
                    import datetime
                    # retire any existing active row
                    now = utc_now().strftime("%Y%m%d%H%M%S")
                    db.execute(text("UPDATE encryption_keys SET label=:ret WHERE label='active'"), {"ret": f"retired::{now}"})
                    # wrap a new DEK with current KEK
                    kek_b64 = (os.getenv("ENCRYPTION_MASTER_KEY_BASE64") or os.getenv("MASTER_KEK_B64") or "").strip()
                    if not kek_b64:
                        # As a last resort, allow ephemeral KEK for dev
                        import base64
                        kek_b64 = base64.b64encode(os.urandom(32)).decode()
                        os.environ.setdefault("ENCRYPTION_MASTER_KEY_BASE64", kek_b64)
                    aes = AESGCM(__import__("base64").b64decode(kek_b64))
                    new_dek = os.urandom(32)
                    nonce = os.urandom(12)
                    wrapped = aes.encrypt(nonce, new_dek, None)
                    db.execute(text(
                        "INSERT INTO encryption_keys(label, dek_wrapped, dek_wrap_nonce) VALUES('active', :w, :n)"
                    ), {"w": wrapped, "n": nonce})
                    db.commit()
                    try:
                        from app.core.crypto_state import load_and_cache_active_dek as _load
                        _load(db)
                        ok = True
                    except Exception:
                        ok = False
            if not ok:
                raise
    print("crypto: initialized (DEK cached)")


def cmd_crypto_status(args):
    from app.core.crypto_state import get_crypto_status as _get_status
    db: Session = next(get_db())
    # Prefer active row; else fallback to most recent
    row = db.execute(text(
        "SELECT label, dek_wrapped, dek_wrap_nonce FROM encryption_keys WHERE label='active' ORDER BY id DESC LIMIT 1"
    )).first()
    if not row:
        row = db.execute(text(
        "SELECT label, dek_wrapped, dek_wrap_nonce FROM encryption_keys ORDER BY created_at DESC, id DESC LIMIT 1"
        )).first()
    if not row:
        # Preserve original status fields for empty DB
        st = _get_status(db)
        st.update({"wlen": 0, "nlen": None})
        print(st)
        return
    w = getattr(row, "dek_wrapped", None) or b""
    n = getattr(row, "dek_wrap_nonce", None)
    nlen = (None if n is None else len(n))
    mode = ("env" if (n is not None and len(n) > 0) else "kms")
    out = {"label": row.label, "mode": mode, "wlen": len(w), "nlen": nlen}
    print(out)


def cmd_txn_demo(args):
    from datetime import date
    from app.orm_models import Transaction  # uses hybrid props
    _ensure_crypto_initialized()
    db: Session = next(get_db())
    t = Transaction(
        merchant_canonical=args.merchant,
        amount=args.amount,
        date=date.fromisoformat(args.date),
    )
    if args.desc:
        t.description_text = args.desc
    if args.raw:
        t.merchant_raw_text = args.raw
    if args.note:
        t.note_text = args.note
    db.add(t)
    db.commit()
    db.refresh(t)
    print({"inserted_id": t.id})


def cmd_txn_show_latest(args):
    from app.orm_models import Transaction
    _ensure_crypto_initialized()
    db: Session = next(get_db())
    t = db.query(Transaction).order_by(Transaction.id.desc()).first()
    if not t:
        print("no transactions")
        return
    print({
        "id": t.id,
        "desc": t.description_text,
        "merchant_raw": t.merchant_raw_text,
        "note": t.note_text,
    })


def cmd_kek_rewrap(args):
    """
    Rotate KEK (re-wrap only): leaves data encrypted with same DEK,
    but rewraps the DEK with a NEW KEK (no table rewrites).
    """
    new_kek_b64 = args.new_kek_b64.strip()
    if not new_kek_b64:
        print("ERROR: --new-kek-b64 is required", file=sys.stderr)
        sys.exit(2)

    # Read current wrapped DEK
    db: Session = next(get_db())
    row = db.execute(text(
        "SELECT id, label, dek_wrapped, dek_wrap_nonce FROM encryption_keys WHERE label='active' "
        "ORDER BY id DESC LIMIT 1"
    )).first()
    if not row:
        print("ERROR: active key not found", file=sys.stderr)
        sys.exit(2)

    # Unwrap with CURRENT KEK (from env), then wrap with NEW KEK
    cur_kek_b64 = os.getenv("ENCRYPTION_MASTER_KEY_BASE64") or os.getenv("MASTER_KEK_B64") or ""
    if not cur_kek_b64:
        print("ERROR: current KEK env not set (ENCRYPTION_MASTER_KEY_BASE64 or MASTER_KEK_B64)", file=sys.stderr)
        sys.exit(2)

    from app.services.crypto import EnvelopeCrypto
    cur_crypto = EnvelopeCrypto(base64.b64decode(cur_kek_b64))
    # Note: original wrap used no AAD; keep it consistent
    dek = cur_crypto.unwrap_dek(row.dek_wrapped, row.dek_wrap_nonce)

    new_crypto = EnvelopeCrypto(base64.b64decode(new_kek_b64))
    new_wrapped, new_nonce = new_crypto.wrap_dek(dek)

    # Update the row in place
    db.execute(text(
        "UPDATE encryption_keys SET dek_wrapped=:w, dek_wrap_nonce=:n WHERE id=:i"
    ), {"w": new_wrapped, "n": new_nonce, "i": row.id})
    db.commit()
    print("KEK rewrap: success (active row updated)")
    # Optional: refresh in-process DEK cache (unchanged) so nothing breaks
    _ensure_crypto_initialized()


def cmd_kek_rewrap_gcp(args):
    """Rewrap the active DEK using Google Cloud KMS (in-place, no data rewrite)."""
    kms_key = os.getenv("GCP_KMS_KEY")
    if not kms_key:
        print("ERROR: GCP_KMS_KEY env not set", file=sys.stderr)
        sys.exit(2)

    db: Session = next(get_db())
    row = db.execute(text(
        "SELECT id, label, dek_wrapped, dek_wrap_nonce FROM encryption_keys WHERE label='active' ORDER BY id DESC LIMIT 1"
    )).first()
    if not row:
        print("ERROR: active key not found", file=sys.stderr)
        sys.exit(2)

    # Unwrap using current scheme: if nonce present -> KEK (try AAD None then b"dek"); else KMS
    wrapped = row.dek_wrapped
    nonce = row.dek_wrap_nonce
    dek: bytes
    if nonce:
        cur_kek_b64 = os.getenv("ENCRYPTION_MASTER_KEY_BASE64") or os.getenv("MASTER_KEK_B64") or ""
        if not cur_kek_b64:
            print("ERROR: current KEK env not set (ENCRYPTION_MASTER_KEY_BASE64 or MASTER_KEK_B64)", file=sys.stderr)
            sys.exit(2)
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM
        aes = AESGCM(base64.b64decode(cur_kek_b64))
        dek = None
        for aad in (None, b"dek"):
            try:
                dek = aes.decrypt(nonce, wrapped, aad)
                break
            except Exception:
                pass
        if dek is None:
            print("ERROR: failed to unwrap DEK with current KEK", file=sys.stderr)
            sys.exit(2)
    else:
        from app.services.gcp_kms_wrapper import kms_unwrap_dek
        dek = kms_unwrap_dek(wrapped)

    # Rewrap with KMS
    from app.services.gcp_kms_wrapper import kms_wrap_dek
    new_wrapped = kms_wrap_dek(dek)
    # Store empty nonce to indicate KMS scheme
    db.execute(text("UPDATE encryption_keys SET dek_wrapped=:w, dek_wrap_nonce=:n WHERE id=:i"), {"w": new_wrapped, "n": b"", "i": row.id})
    db.commit()
    print("KMS rewrap: success (active row updated)")
    _ensure_crypto_initialized()


def cmd_kek_rewrap_gcp_to(args):
    """Rewrap the stored DEK to a different GCP KMS key (no data rewrite)."""
    import os, base64
    from sqlalchemy import text
    from app.db import get_db
    from google.cloud import kms_v1
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM

    label = args.label or "active"
    db: Session = next(get_db())

    row = db.execute(text(
        "SELECT id, label, dek_wrapped, dek_wrap_nonce, kms_key_id "
        "FROM encryption_keys WHERE label=:label ORDER BY created_at DESC LIMIT 1"
    ), {"label": label}).first()
    if not row:
        raise SystemExit(f"No encryption key found for label '{label}'")

    # 1) Get plaintext DEK
    plain: bytes | None = None
    if row.dek_wrap_nonce:
        kek_b64 = (os.getenv("ENCRYPTION_MASTER_KEY_BASE64") or os.getenv("MASTER_KEK_B64") or "").strip()
        if not kek_b64:
            raise SystemExit("Current DEK is env-KEK wrapped; set ENCRYPTION_MASTER_KEY_BASE64 (or MASTER_KEK_B64) for this exec.")
        kek_b64 += "=" * ((4 - len(kek_b64) % 4) % 4)
        aes = AESGCM(base64.b64decode(kek_b64))
        for aad in (None, b"dek"):
            try:
                plain = aes.decrypt(row.dek_wrap_nonce, row.dek_wrapped, aad)
                break
            except Exception:
                pass
        if plain is None:
            raise SystemExit("Failed to unwrap DEK with provided KEK (AAD mismatch or wrong key).")
    else:
        cur_key = row.kms_key_id or os.getenv("GCP_KMS_KEY")
        if not cur_key:
            raise SystemExit("KMS mode but kms_key_id & GCP_KMS_KEY are empty; cannot decrypt.")
        aad_s = os.getenv("GCP_KMS_AAD")
        aad = aad_s.encode() if aad_s else None
        client = kms_v1.KeyManagementServiceClient()
        resp = client.decrypt(request={"name": cur_key, "ciphertext": row.dek_wrapped, "additional_authenticated_data": aad})
        plain = resp.plaintext

    to_key = args.to_key
    aad_s2 = args.aad if args.aad is not None else os.getenv("GCP_KMS_AAD")
    aad2 = aad_s2.encode() if aad_s2 else None

    if args.dry_run:
        print({
            "label": label,
            "current_mode": ("env" if row.dek_wrap_nonce else "kms"),
            "current_kms_key": getattr(row, "kms_key_id", None),
            "target_kms_key": to_key,
            "aad_used": aad_s2,
            "action": "would rewrap",
        })
        return

    client = kms_v1.KeyManagementServiceClient()
    enc = client.encrypt(request={"name": to_key, "plaintext": plain, "additional_authenticated_data": aad2})

    # 3) Update row to KMS mode and store metadata when columns exist
    try:
        db.execute(text(
            """
            UPDATE encryption_keys
               SET dek_wrapped = :w,
                   dek_wrap_nonce = NULL,
                   wrap_scheme = COALESCE(wrap_scheme, 'gcp_kms'),
                   kms_key_id = :kid
             WHERE id = :i
            """
        ), {"w": enc.ciphertext, "kid": to_key, "i": row.id})
    except Exception:
        db.execute(text(
            """
            UPDATE encryption_keys
               SET dek_wrapped = :w,
                   dek_wrap_nonce = NULL
             WHERE id = :i
            """
        ), {"w": enc.ciphertext, "i": row.id})

    db.commit()
    print(f"Rewrapped label='{label}' to KMS key: {to_key}")


def cmd_force_new_active_dek(args):
    """Force-create a new active DEK without unwrapping the old one.

    Safe when no data is encrypted yet. The previous active row will be renamed to retired::<ts>.
    If --kms is provided and GCP_KMS_KEY is configured, the new DEK will be wrapped with KMS; else KEK is used.
    """
    import datetime, os
    from sqlalchemy import text
    from sqlalchemy.orm import Session
    from app.db import get_db
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM

    db: Session = next(get_db())

    # Check for encrypted data presence
    enc_rows = db.execute(text(
        """
        SELECT COUNT(*) FROM transactions t
        WHERE t.description_enc IS NOT NULL OR t.merchant_raw_enc IS NOT NULL OR t.note_enc IS NOT NULL
        """
    )).scalar() or 0
    if enc_rows and not args.force:
        print({
            "error": "encrypted data exists; refusing to replace active DEK",
            "encrypted_rows": int(enc_rows),
            "hint": "Rewrap the current DEK instead (kek-rewrap-gcp or kek-rewrap-gcp-to). Use --force to override.",
        }, file=sys.stderr)
        sys.exit(2)

    # Prepare new DEK
    new_dek = os.urandom(32)
    kms_key = os.getenv("GCP_KMS_KEY") if args.kms else None

    if kms_key:
        from app.services.gcp_kms_wrapper import kms_wrap_dek  # type: ignore
        wrapped = kms_wrap_dek(new_dek)
        nonce = None
    else:
        kek_b64 = (os.getenv("ENCRYPTION_MASTER_KEY_BASE64") or os.getenv("MASTER_KEK_B64") or "").strip()
        if not kek_b64:
            print("ERROR: KEK env not set (ENCRYPTION_MASTER_KEY_BASE64 or MASTER_KEK_B64)", file=sys.stderr)
            sys.exit(2)
        aes = AESGCM(base64.b64decode(kek_b64))
        nonce = os.urandom(12)
        wrapped = aes.encrypt(nonce, new_dek, None)

    # Rotate labels: active -> retired::<ts>
    now = utc_now().strftime("%Y%m%d%H%M%S")
    retired = f"retired::{now}"
    db.execute(text("UPDATE encryption_keys SET label=:ret WHERE label='active'"), {"ret": retired})

    # Insert new active row
    if nonce is None:
        db.execute(text(
            "INSERT INTO encryption_keys(label, dek_wrapped, dek_wrap_nonce) VALUES('active', :w, NULL)"
        ), {"w": wrapped})
    else:
        db.execute(text(
            "INSERT INTO encryption_keys(label, dek_wrapped, dek_wrap_nonce) VALUES('active', :w, :n)"
        ), {"w": wrapped, "n": nonce})
    db.commit()
    # Set write_label to active just in case
    try:
        from app.core.crypto_state import set_write_label as _set_write_label
        _set_write_label("active")
    except Exception:
        pass
    print({"new_active": "created", "mode": ("kms" if nonce is None else "env"), "retired_label": retired})

def main():
    p = argparse.ArgumentParser(prog="app.cli")
    sub = p.add_subparsers(dest="cmd")

    sub.add_parser("crypto-init").set_defaults(fn=cmd_crypto_init)
    sub.add_parser("crypto-status", help="Show encryption mode/label").set_defaults(fn=cmd_crypto_status)

    d = sub.add_parser("txn-demo")
    d.add_argument("--merchant", default="demo")
    d.add_argument("--amount", type=float, default=-4.50)
    d.add_argument("--date", default="2024-01-02")
    d.add_argument("--desc")
    d.add_argument("--raw")
    d.add_argument("--note")
    d.set_defaults(fn=cmd_txn_demo)

    sub.add_parser("txn-show-latest").set_defaults(fn=cmd_txn_show_latest)

    r = sub.add_parser("kek-rewrap")
    r.add_argument("--new-kek-b64", required=True)
    r.set_defaults(fn=cmd_kek_rewrap)

    r_kms = sub.add_parser("kek-rewrap-gcp")
    r_kms.set_defaults(fn=cmd_kek_rewrap_gcp)

    r_kms_to = sub.add_parser("kek-rewrap-gcp-to", help="Rewrap the stored DEK to a different GCP KMS key (no data rewrite).")
    r_kms_to.add_argument("--to-key", required=True, help="Target KMS key resource: projects/.../locations/.../keyRings/.../cryptoKeys/KEY")
    r_kms_to.add_argument("--label", default="active", help="Key label to rewrap (default: active)")
    r_kms_to.add_argument("--aad", default=None, help="Optional AAD for target wrap; defaults to GCP_KMS_AAD env if omitted")
    r_kms_to.add_argument("--dry-run", action="store_true", help="Show what would happen then exit")
    r_kms_to.set_defaults(fn=cmd_kek_rewrap_gcp_to)

    # Force-create a new active DEK (no unwrap of old)
    r_force = sub.add_parser("force-new-active-dek", help="Create a new active DEK without needing the old KEK (safe if no data)")
    r_force.add_argument("--kms", action="store_true", help="Wrap new DEK with KMS if configured (requires GCP_KMS_KEY)")
    r_force.add_argument("--force", action="store_true", help="Proceed even if encrypted rows exist (dangerous)")
    r_force.set_defaults(fn=cmd_force_new_active_dek)

    # DEK rotation commands
    def cmd_dek_rotate_begin(a):
        new_label = begin_new_dek(a.label)
        set_write_label(new_label)
        print({"new_label": new_label, "write_label": get_write_label()})
    r0 = sub.add_parser("dek-rotate-begin")
    r0.add_argument("--label", help="Optional new label (default rotating::<UTC timestamp>)")
    r0.set_defaults(fn=cmd_dek_rotate_begin)

    r1 = sub.add_parser("dek-rotate-run")
    r1.add_argument("--new-label", required=True)
    r1.add_argument("--batch-size", type=int, default=1000)
    r1.add_argument("--max-batches", type=int, default=0, help="0=one batch; N=run N batches then stop")
    r1.add_argument("--dry-run", action="store_true")
    r1.set_defaults(fn=lambda a: print(run_rotation(a.new_label, a.batch_size, a.max_batches, a.dry_run)))

    def cmd_dek_rotate_finalize(a):
        labels = finalize_rotation(a.new_label)
        set_write_label("active")
        print({"labels": labels, "write_label": get_write_label()})
    r2 = sub.add_parser("dek-rotate-finalize")
    r2.add_argument("--new-label", required=True)
    r2.set_defaults(fn=cmd_dek_rotate_finalize)

    r3 = sub.add_parser("dek-rotate-status")
    r3.add_argument("--new-label", required=False)
    r3.set_defaults(fn=lambda a: print(rotation_status(a.new_label)))

    # write label controls
    wl_g = sub.add_parser("write-label-get")
    wl_g.set_defaults(fn=lambda a: print({"write_label": get_write_label()}))
    wl_s = sub.add_parser("write-label-set")
    wl_s.add_argument("--label", required=True)
    wl_s.set_defaults(fn=lambda a: (set_write_label(a.label), print({"write_label": get_write_label()})))

    args = p.parse_args()
    if not getattr(args, "cmd", None):
        p.print_help()
        sys.exit(1)
    args.fn(args)


if __name__ == "__main__":
    main()
