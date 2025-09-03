from fastapi import APIRouter, UploadFile, File, Query, Depends
from sqlalchemy.orm import Session
from sqlalchemy import select, update
from io import TextIOWrapper
import csv, datetime as dt
from ..db import get_db
from app.orm_models import Transaction

router = APIRouter(prefix="/ingest", tags=["ingest"])

@router.post("")
async def ingest_csv(
    file: UploadFile = File(...),
    replace: bool = Query(False),
    db: Session = Depends(get_db),
):
    if replace:
        db.query(Transaction).delete()
        db.commit()
        # keep legacy in-memory state in sync
        try:
            from ..main import app
            app.state.txns = []
        except Exception:
            pass

    reader = csv.DictReader(TextIOWrapper(file.file, encoding="utf-8"))
    added = 0
    # prepare legacy in-memory list for compatibility
    try:
        from ..main import app
        mem_list = getattr(app.state, "txns", [])
    except Exception:
        mem_list = None
    next_id = (len(mem_list) + 1) if isinstance(mem_list, list) else 1
    for row in reader:
        # map/parse your CSV columns here
        # robust parse and ensure month string
        date = dt.datetime.strptime(row["date"], "%Y-%m-%d").date()
        amount = float(row["amount"])
        desc = row.get("description") or row.get("memo") or ""
        merch = row.get("merchant") or None
        acct = row.get("account") or None
        raw_cat = row.get("category") or None
        month = date.strftime("%Y-%m")

        exists = db.execute(
            select(Transaction.id).where(
                Transaction.date == date,
                Transaction.amount == amount,
                Transaction.description == desc,
            )
        ).first()
        if exists:
            continue

        db.add(
            Transaction(
                date=date,
                amount=amount,
                description=desc,
                merchant=merch,
                account=acct,
                raw_category=raw_cat,
                month=month,  # ensure month is set on insert
                category=None,
            )
        )
        added += 1

        # mirror into in-memory list for existing endpoints
        if isinstance(mem_list, list):
            try:
                tx = {
                    "id": next_id,
                    "date": date.isoformat(),
                    "merchant": merch or "",
                    "description": desc or "",
                    "amount": amount,
                    "category": "Unknown",
                }
                mem_list.append(tx)
                next_id += 1
            except Exception:
                pass

    db.commit()

    # Optional: backfill month for any existing rows with NULL month (one-time maintenance)
    if not replace:
        null_rows = db.execute(select(Transaction.id, Transaction.date).where(Transaction.month.is_(None))).all()
        if null_rows:
            for rid, d in null_rows:
                db.execute(update(Transaction).where(Transaction.id == rid).values(month=d.strftime("%Y-%m")))
            db.commit()
    # include both keys for compatibility
    return {"ok": True, "added": added, "count": added}
