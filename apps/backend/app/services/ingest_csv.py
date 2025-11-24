import csv
import io
import datetime as dt
from pathlib import Path
from sqlalchemy.orm import Session
from app.orm_models import Transaction
from app.core.category_mappings import normalize_category

INCOME_HINTS = (
    "payroll",
    "paycheck",
    "salary",
    "employer",
    "bonus",
    "refund",
    "reimbursement",
    "interest",
    "dividend",
    "income",
    "deposit",
    "transfer in",
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
    expenses_are_positive: bool = False,  # NEW
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
        description = (
            r.get("description") or r.get("Description") or ""
        ).strip() or None
        raw_category = (r.get("category") or r.get("Category") or "").strip() or None
        # Map CSV category label to internal slug
        category = normalize_category(raw_category) if raw_category else None
        amt_raw = (r.get("amount") or r.get("Amount") or "0").replace(",", "").strip()
        try:
            amount = float(amt_raw or 0)
        except Exception:
            amount = 0.0

        # Flip positive expenses to negative (keep obvious income positive)
        if expenses_are_positive and amount > 0:
            blob = f"{merchant or ''} {description or ''} {category or ''}".lower()
            looks_income = (category and category.lower() == "income") or any(
                h in blob for h in INCOME_HINTS
            )
            if not looks_income:
                amount = -abs(amount)

        db.add(
            Transaction(
                date=date_obj,  # <-- store DATE, not string
                month=month,  # <-- keep month string
                merchant=merchant,
                merchant_canonical=merchant,
                description=description,
                amount=amount,
                category=category or None,  # Internal slug from mapping
                raw_category=raw_category or None,  # Original CSV label
            )
        )
        rows += 1

    db.commit()
    return rows


def ingest_csv_for_user(
    db: Session,
    user_id: int,
    csv_path: str | Path,
    clear_existing: bool = False,
) -> int:
    """
    Ingest transactions from CSV file for a specific user.

    Expected CSV format:
        date,description,merchant,amount,category
        2025-11-12,APPLE.COM/BILL,APPLE,-2.99,subscriptions_digital

    Args:
        db: Database session
        user_id: User ID to associate transactions with
        csv_path: Path to CSV file
        clear_existing: If True, delete existing transactions first

    Returns:
        Number of transactions inserted
    """
    csv_path = Path(csv_path)

    if not csv_path.exists():
        raise FileNotFoundError(f"CSV file not found: {csv_path}")

    # Clear existing transactions if requested
    if clear_existing:
        deleted = db.query(Transaction).filter(Transaction.user_id == user_id).delete()
        db.commit()
        print(f"✓ Deleted {deleted} existing transactions for user {user_id}")

    # Read and parse CSV
    rows_added = 0
    rows_skipped = 0
    with open(csv_path, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)

        for row in reader:
            # Parse date
            date_str = row.get("date", "").strip()
            date_obj = _parse_date(date_str)
            if not date_obj:
                print(f"⚠ Skipping row with invalid date: {row}")
                continue

            month = date_obj.strftime("%Y-%m")
            description = row.get("description", "").strip()
            merchant = row.get("merchant", description).strip()

            # Parse amount
            try:
                amt_raw = row.get("amount", "0").replace(",", "").strip()
                amount = float(amt_raw)
            except (ValueError, TypeError):
                print(f"⚠ Skipping row with invalid amount: {row}")
                continue

            # Map category label to slug
            raw_category = row.get("category", "").strip() or None
            category_slug = normalize_category(raw_category) if raw_category else None

            # Check for duplicates (UNIQUE constraint on date, amount, description)
            # Check both in DB and in current batch
            existing = (
                db.query(Transaction)
                .filter(
                    Transaction.user_id == user_id,
                    Transaction.date == date_obj,
                    Transaction.amount == amount,
                    Transaction.description == description,
                )
                .first()
            )

            if existing:
                rows_skipped += 1
                continue

            # Create transaction
            txn = Transaction(
                user_id=user_id,
                date=date_obj,
                month=month,
                merchant=merchant,
                merchant_canonical=merchant,
                description=description,
                amount=amount,
                category=category_slug,
                raw_category=raw_category,
                pending=False,
            )

            db.add(txn)
            rows_added += 1

            # Flush every 50 rows to catch duplicates early
            if rows_added % 50 == 0:
                try:
                    db.flush()
                except Exception:
                    print(
                        f"⚠ Duplicate transaction skipped: {description} on {date_obj}"
                    )
                    db.rollback()
                    rows_skipped += 1

    try:
        db.commit()
    except Exception as e:
        db.rollback()
        print(f"❌ Error during final commit: {e}")
        raise
    print(f"✓ Ingested {rows_added} transactions from {csv_path.name}")
    if rows_skipped > 0:
        print(f"  (skipped {rows_skipped} duplicates)")
    return rows_added


def ingest_demo_csv(
    db: Session,
    user_id: int,
    clear_existing: bool = True,
) -> int:
    """
    Ingest demo CSV data for a user.

    Uses the CSV file at: apps/backend/sample_hints_pass3_real_data.csv

    Args:
        db: Database session
        user_id: User ID to seed data for
        clear_existing: If True, delete existing transactions first

    Returns:
        Number of transactions inserted
    """
    # Path to demo CSV (relative to backend root)
    backend_root = Path(__file__).parent.parent.parent
    demo_csv = backend_root / "sample_hints_pass3_real_data.csv"

    if not demo_csv.exists():
        raise FileNotFoundError(
            f"Demo CSV not found: {demo_csv}\n"
            "Expected location: apps/backend/sample_hints_pass3_real_data.csv"
        )

    return ingest_csv_for_user(
        db=db,
        user_id=user_id,
        csv_path=demo_csv,
        clear_existing=clear_existing,
    )
