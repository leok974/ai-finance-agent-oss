from fastapi import (
    APIRouter,
    UploadFile,
    File,
    Query,
    Depends,
    Response,
    Request,
    HTTPException,
)
from sqlalchemy.orm import Session
from sqlalchemy import select, update
from io import TextIOWrapper
import csv
import datetime as dt
from ..db import get_db
from app.transactions import Transaction
from app.services.ingest_utils import detect_positive_expense_format

MAX_UPLOAD_MB = 5  # adjust to your spec; 12MB test should 413


def enforce_max_upload(request: Request, max_mb: int = MAX_UPLOAD_MB):
    cl = request.headers.get("content-length")
    try:
        size = int(cl) if cl else None
    except ValueError:
        size = None
    if size is not None and size > max_mb * 1024 * 1024:
        # short-circuit before body parsing
        raise HTTPException(status_code=413, detail="Request Entity Too Large")


router = APIRouter(
    prefix="/ingest", tags=["ingest"], dependencies=[Depends(enforce_max_upload)]
)


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
    reader = csv.DictReader(
        (line for line in wrapper if line.strip()), skipinitialspace=True
    )
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

    # Track earliest and latest dates to return detected month range
    earliest_date = None
    latest_date = None

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
        income_hint = (
            any(
                k in desc_l or k in merch_l
                for k in (
                    "employer",
                    "payroll",
                    "salary",
                    "paycheck",
                    "payout",
                    "reimbursement",
                    "refund",
                    "rebate",
                    "deposit",
                    "interest",
                    "dividend",
                )
            )
            or raw_amt >= 500.0
        )  # large positives: likely income
        if flip and not income_hint:
            amount = -raw_amt
        else:
            amount = raw_amt
        desc = row.get("description") or row.get("memo") or ""
        merch = row.get("merchant") or None
        acct = row.get("account") or None
        raw_cat = row.get("category") or None
        month = date.strftime("%Y-%m")

        # Track date range for detected_month
        if earliest_date is None or date < earliest_date:
            earliest_date = date
        if latest_date is None or date > latest_date:
            latest_date = date

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
        null_rows = db.execute(
            select(Transaction.id, Transaction.date).where(Transaction.month.is_(None))
        ).all()
        if null_rows:
            for rid, d in null_rows:
                db.execute(
                    update(Transaction)
                    .where(Transaction.id == rid)
                    .values(month=d.strftime("%Y-%m"))
                )
            db.commit()

    # Return detected month (use latest date's month, which is typically most relevant)
    detected_month = latest_date.strftime("%Y-%m") if latest_date else None

    # include both keys for compatibility
    return {
        "ok": True,
        "added": added,
        "count": added,
        "flip_auto": flip and (expenses_are_positive is None),
        "detected_month": detected_month,
        "date_range": (
            {
                "earliest": earliest_date.isoformat() if earliest_date else None,
                "latest": latest_date.isoformat() if latest_date else None,
            }
            if earliest_date and latest_date
            else None
        ),
    }


@router.put("")
async def ingest_csv_put(
    file: UploadFile = File(...),
    replace: bool = Query(False),
    expenses_are_positive: bool | None = Query(None),
    db: Session = Depends(get_db),
):
    """PUT alias for ingest to support idempotent clients; delegates to POST handler."""
    return await ingest_csv(
        file=file,
        replace=replace,
        expenses_are_positive=expenses_are_positive,
        db=db,
    )


@router.head("")
async def ingest_head():
    """Health/lightweight check for ingest endpoint; no body returned."""
    return Response(status_code=204, headers={"Cache-Control": "no-store"})
