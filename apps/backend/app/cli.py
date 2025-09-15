import os, sys, argparse, base64
os.environ.setdefault("PYTHONPATH","/app")

from app.db import get_db
from sqlalchemy.orm import Session
from sqlalchemy import text

# Initializer ensures encryption_keys row exists + caches DEK
from app.scripts.encrypt_txn_backfill_splitcols import _ensure_crypto_initialized
from app.scripts.dek_rotation import begin_new_dek, run_rotation, finalize_rotation, rotation_status
from app.core.crypto_state import set_write_label, get_write_label


def cmd_crypto_init(args):
    _ensure_crypto_initialized()
    print("crypto: initialized (DEK cached)")


def cmd_crypto_status(args):
    db: Session = next(get_db())
    rows = db.execute(text(
        "SELECT label, octet_length(dek_wrapped) AS wlen, octet_length(dek_wrap_nonce) AS nlen, created_at "
        "FROM encryption_keys ORDER BY created_at DESC"
    )).fetchall()
    for r in rows:
        print(dict(r._mapping))


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


def main():
    p = argparse.ArgumentParser(prog="app.cli")
    sub = p.add_subparsers(dest="cmd")

    sub.add_parser("crypto-init").set_defaults(fn=cmd_crypto_init)
    sub.add_parser("crypto-status").set_defaults(fn=cmd_crypto_status)

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
