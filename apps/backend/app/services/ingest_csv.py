import csv, io
from typing import Iterable
from sqlalchemy.orm import Session
from app.orm_models import Transaction

INCOME_HINTS = (
    "payroll","paycheck","salary","employer","bonus","refund","reimbursement",
    "interest","dividend","income","deposit","transfer in"
)

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
        date = (r.get("date") or r.get("Date") or "").strip()
        merchant = (r.get("merchant") or r.get("Merchant") or "").strip() or None
        description = (r.get("description") or r.get("Description") or "").strip() or None
        category = (r.get("category") or r.get("Category") or "").strip() or None
        amt_raw = (r.get("amount") or r.get("Amount") or "0").replace(",", "").strip()
        try:
            amount = float(amt_raw or 0)
        except Exception:
            amount = 0.0

        # Normalize month (expects ISO date like YYYY-MM-DD)
        month = date[:7] if date else None

        # Flip positive expenses to negative (keep obvious income positive)
        if expenses_are_positive and amount > 0:
            blob = f"{merchant or ''} {description or ''} {category or ''}".lower()
            looks_income = (category and category.lower() == "income") or any(h in blob for h in INCOME_HINTS)
            if not looks_income:
                amount = -abs(amount)

        db.add(Transaction(
            date=date or None,
            month=month,
            merchant=merchant,
            description=description,
            amount=amount,
            category=category or None,
        ))
        rows += 1

    db.commit()
    return rows
