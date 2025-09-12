# Run with:  python -m app.scripts.recanonicalize_merchants --batch 1000 --dry-run
from __future__ import annotations
import argparse
from typing import Iterable, Tuple
from sqlalchemy import text
from app.db import SessionLocal
from app.utils.text import canonicalize_merchant


def iter_txn_rows(conn, batch: int) -> Iterable[Tuple[int, str | None]]:
    offset = 0
    while True:
        rows = conn.execute(
            text("SELECT id, merchant FROM transactions ORDER BY id ASC LIMIT :lim OFFSET :off"),
            {"lim": batch, "off": offset},
        ).fetchall()
        if not rows:
            break
        for r in rows:
            yield r[0], r[1]
        offset += batch


ession = None

def main():
    ap = argparse.ArgumentParser(description="Recompute transactions.merchant_canonical")
    ap.add_argument("--batch", type=int, default=1000, help="Batch size for scanning")
    ap.add_argument("--dry-run", action="store_true", help="Do not write, just report")
    ap.add_argument("--only-missing", action="store_true", help="Update rows where merchant_canonical is NULL/empty only")
    args = ap.parse_args()

    session = SessionLocal()
    conn = session.connection()
    updates = 0
    scanned = 0

    print(f"[recanonicalize] batch={args.batch} dry_run={args.dry_run} only_missing={args.only_missing}")
    try:
        if args.only_missing:
            q = text("SELECT id, merchant FROM transactions WHERE merchant_canonical IS NULL OR merchant_canonical = '' ORDER BY id")
            rows = conn.execute(q).fetchall()
            iterable = ((r[0], r[1]) for r in rows)
        else:
            iterable = iter_txn_rows(conn, args.batch)

        for id_, merchant in iterable:
            scanned += 1
            mc = canonicalize_merchant(merchant)
            if args.only_missing:
                # if missing, we always want to set whatever mc is (including NULL)
                do_update = True
            else:
                # update only if value would change
                current = conn.execute(text("SELECT merchant_canonical FROM transactions WHERE id=:id"), {"id": id_}).scalar()
                do_update = (current != mc)

            if do_update:
                updates += 1
                if not args.dry_run:
                    conn.execute(text("UPDATE transactions SET merchant_canonical=:mc WHERE id=:id"), {"mc": mc, "id": id_})

        if not args.dry_run:
            session.commit()

        print(f"[recanonicalize] scanned={scanned} updates={updates} dry_run={args.dry_run}")
    finally:
        session.close()


if __name__ == "__main__":
    main()
