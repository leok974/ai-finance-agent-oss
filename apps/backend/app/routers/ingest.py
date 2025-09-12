from fastapi import APIRouter, UploadFile, File, Query, Depends
from sqlalchemy.orm import Session
from sqlalchemy import select, update
from io import TextIOWrapper
import csv, datetime as dt
from ..db import get_db
from app.transactions import Transaction
from app.services.ingest_utils import detect_positive_expense_format

router = APIRouter(prefix="/ingest", tags=["ingest"])

@router.post("")
async def ingest_csv(
    file: UploadFile = File(...),
    replace: bool = Query(False),
    expenses_are_positive: bool | None = Query(None),  # <-- now optional
    db: Session = Depends(get_db),
):
    """
    Ingest CSV; if `expenses_are_positive` is None, auto-detect and flip if needed.
    Expected columns: date, amount, merchant, description, category? (category optional)
    """
    if replace:
        db.query(Transaction).delete()
        db.commit()
        # keep legacy in-memory state in sync
        try:
            from ..main import app
            app.state.txns = []
        except Exception:
            pass

    # Read all rows once for inference and processing
    wrapper = TextIOWrapper(file.file, encoding="utf-8")
    # Skip empty lines so a leading newline doesn't become an empty header
    reader = csv.DictReader((line for line in wrapper if line.strip()), skipinitialspace=True)
    rows = list(reader)

    # Try to infer if not provided
    flip = False
    if expenses_are_positive is None:
        sample = []
        for r in rows[:200]:
            amt_str = (r.get("amount") or "").strip()
            if not amt_str:
                continue
            try:
                amt = float(amt_str)
            except ValueError:
                continue
            desc = (r.get("description") or r.get("memo") or "").strip()
            sample.append((amt, desc))
        flip = detect_positive_expense_format(sample)
    else:
        flip = bool(expenses_are_positive)

    added = 0
    # prepare legacy in-memory list for compatibility
    try:
        from ..main import app
        mem_list = getattr(app.state, "txns", [])
    except Exception:
        mem_list = None
    next_id = (len(mem_list) + 1) if isinstance(mem_list, list) else 1
    
    for row in rows:
        # map/parse your CSV columns here
        # robust parse and ensure month string
        try:
            date_str = (row.get("date") or "").strip()
            if not date_str:
                continue
            try:
                date = dt.date.fromisoformat(date_str[:10])
            except Exception:
                # Try common alt formats
                for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%Y/%m/%d"):
                    try:
                        date = dt.datetime.strptime(date_str, fmt).date()
                        break
                    except Exception:
                        date = None
                if not date:
                    continue
        except (ValueError, KeyError):
            continue

        amt_str = (row.get("amount") or "").strip()
        raw_amt = float(amt_str) if amt_str else 0.0
        # Normalize: expenses negative, income positive. If flip==True, only flip likely expenses.
        # Heuristic: treat employer/paycheck/refund/reimbursement as income-like; don't flip those.
        desc_l = (row.get("description") or row.get("memo") or "").lower()
        merch_l = (row.get("merchant") or "").lower()
        income_hint = any(k in desc_l or k in merch_l for k in (
            "employer","payroll","salary","paycheck","payout","reimbursement","refund","rebate","deposit","interest","dividend"
        )) or raw_amt >= 500.0  # large positives: likely income
        if flip and not income_hint:
            amount = -raw_amt
        else:
            amount = raw_amt
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
    return {"ok": True, "added": added, "count": added, "flip_auto": flip and (expenses_are_positive is None)}
