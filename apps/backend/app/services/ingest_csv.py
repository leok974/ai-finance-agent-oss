import csv
import io
import datetime as dt
from sqlalchemy.orm import Session
from app.orm_models import Transaction

INCOME_HINTS = (
    "payroll","paycheck","salary","employer","bonus","refund","reimbursement",
    "interest","dividend","income","deposit","transfer in"
)

def _parse_date(s: str | None) -> dt.date | None:
    if not s:
        return None
    s = s.strip()
    # try ISO first
    try:
        return dt.date.fromisoformat(s[:10])
    except Exception:
        pass
    # add any custom parse formats you need here
    # try MM/DD/YYYY
    for fmt in ("%m/%d/%Y", "%m/%d/%y", "%d/%m/%Y", "%Y/%m/%d"):
        try:
            return dt.datetime.strptime(s[:10], fmt).date()
        except Exception:
            continue
    return None

async def ingest_csv_file(
    db: Session,
    file,
    replace: bool,
    expenses_are_positive: bool = False,   # NEW
) -> int:
    if replace:
        db.query(Transaction).delete()
        db.commit()

    raw = await file.read()
    text = raw.decode("utf-8", errors="ignore")
    reader = csv.DictReader(io.StringIO(text))

    rows = 0
    for r in reader:
        # Adjust these keys to your CSV columns if different
        date_str = (r.get("date") or r.get("Date") or "").strip()
        date_obj = _parse_date(date_str)  # <-- proper Python date
        month = date_obj.strftime("%Y-%m") if date_obj else None
        
        merchant = (r.get("merchant") or r.get("Merchant") or "").strip() or None
        description = (r.get("description") or r.get("Description") or "").strip() or None
        category = (r.get("category") or r.get("Category") or "").strip() or None
        amt_raw = (r.get("amount") or r.get("Amount") or "0").replace(",", "").strip()
        try:
            amount = float(amt_raw or 0)
        except Exception:
            amount = 0.0

        # Flip positive expenses to negative (keep obvious income positive)
        if expenses_are_positive and amount > 0:
            blob = f"{merchant or ''} {description or ''} {category or ''}".lower()
            looks_income = (category and category.lower() == "income") or any(h in blob for h in INCOME_HINTS)
            if not looks_income:
                amount = -abs(amount)

        db.add(Transaction(
            date=date_obj,          # <-- store DATE, not string
            month=month,            # <-- keep month string
            merchant=merchant,
            description=description,
            amount=amount,
            category=category or None,
        ))
        rows += 1

    db.commit()
    return rows
