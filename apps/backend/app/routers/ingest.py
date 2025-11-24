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
from app.deps.auth_guard import get_current_user_id
from sqlalchemy import select, update, delete
from app.utils.csrf import csrf_protect, issue_csrf_cookie
from io import TextIOWrapper
import csv
import datetime as dt
import logging
import re
from decimal import Decimal, InvalidOperation
from enum import Enum
from typing import Iterator
from uuid import uuid4
from ..db import get_db
from app.transactions import Transaction
from app.services.ingest_utils import detect_positive_expense_format
from app.services.metrics import INGEST_REQUESTS, INGEST_ERRORS, INGEST_FILES
from app.core.category_mappings import normalize_category

logger = logging.getLogger(__name__)


class CsvFormat(str, Enum):
    """Supported CSV formats for transaction import."""

    GENERIC = "generic"  # LedgerMind sample format
    BANK_EXPORT_V1 = "bank_v1"  # Date,Description,Comments,Check Number,Amount,Balance
    BANK_DEBIT_CREDIT = "bank_dc"  # Date,Description,Debit,Credit,Balance
    BANK_POSTED_EFFECTIVE = (
        "bank_pe"  # Posted Date,Effective Date,Description,Amount,Type,Balance
    )
    UNKNOWN = "unknown"


def detect_csv_format(fieldnames: list[str] | None) -> CsvFormat:
    """Detect CSV format based on headers."""
    if not fieldnames:
        return CsvFormat.UNKNOWN

    headers = [h.strip().lower() for h in fieldnames]
    header_set = set(headers)

    # Bank export v1: Date,Description,Comments,Check Number,Amount,Balance
    bank_v1_headers = {
        "date",
        "description",
        "comments",
        "check number",
        "amount",
        "balance",
    }
    if bank_v1_headers.issubset(header_set):
        return CsvFormat.BANK_EXPORT_V1

    # Bank debit/credit: Date,Description,Debit,Credit,Balance
    if {"date", "description", "debit", "credit"}.issubset(header_set):
        return CsvFormat.BANK_DEBIT_CREDIT

    # Bank posted/effective: Posted Date,Description,Amount (Effective Date optional)
    if {"posted date", "description", "amount"}.issubset(header_set):
        return CsvFormat.BANK_POSTED_EFFECTIVE

    # Generic LedgerMind format: date, amount, description (merchant optional)
    generic_required = {"date", "amount"}
    if generic_required.issubset(header_set):
        return CsvFormat.GENERIC

    return CsvFormat.UNKNOWN


def _parse_bank_amount(raw: str | None) -> Decimal | None:
    """Parse bank-style currency amounts: -$2.99, $850.00, ($12.34), $3,628.37"""
    s = (raw or "").strip()
    if not s:
        return None

    sign = 1
    # Handle parentheses negatives: ($12.34)
    if s.startswith("(") and s.endswith(")"):
        sign = -1
        s = s[1:-1].strip()

    # Leading +/-
    if s.startswith("+"):
        s = s[1:].strip()
    elif s.startswith("-"):
        sign = -1
        s = s[1:].strip()

    # Drop currency symbols and thousands separators
    s = s.replace("$", "").replace(",", "").strip()
    if not s:
        return None

    try:
        return Decimal(s) * sign
    except (InvalidOperation, ValueError):
        return None


def _parse_bank_date(raw: str | None) -> dt.date | None:
    """Parse bank date: mm/dd/yyyy or yyyy-mm-dd"""
    s = (raw or "").strip()
    if not s:
        return None

    # Try US format first (11/12/2025), then ISO
    for fmt in ("%m/%d/%Y", "%Y-%m-%d", "%m/%d/%y"):
        try:
            return dt.datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    return None


def _extract_bank_merchant(desc_raw: str | None) -> str:
    """Extract merchant from bank description, removing noise."""
    s = (desc_raw or "").replace("\r\n", " ").replace("\n", " ")

    # Strip "Processing..." and "(Pending)"
    s = re.sub(r"^Processing\.*\s*", "", s, flags=re.IGNORECASE)
    s = re.sub(r"\s*\(Pending\)\s*$", "", s, flags=re.IGNORECASE)

    # Remove common bank prefixes
    for prefix in (
        "Point Of Sale Withdrawal",
        "Point Of Sale Purchase",
        "Wire Transfer Deposit",
        "Wire Transfer Withdrawal",
        "ACH Withdrawal",
        "ACH Deposit",
        "POS Debit",
        "POS Credit",
    ):
        if s.lower().startswith(prefix.lower()):
            s = s[len(prefix) :].strip()
            break

    # Use double-space gap to trim trailing city/state when present
    main = re.split(r"\s{2,}", s)[0]
    main = re.sub(r"\s+", " ", main).strip()
    return main or "Unknown"


def _clean_bank_description(desc_raw: str | None) -> str:
    """Clean bank description, preserving context but removing noise."""
    s = (desc_raw or "").replace("\r\n", " ").replace("\n", " ")
    s = re.sub(r"\s+", " ", s).strip()
    # Drop pending markers
    s = re.sub(r"^Processing\.*\s*", "", s, flags=re.IGNORECASE)
    s = re.sub(r"\s*\(Pending\)\s*$", "", s, flags=re.IGNORECASE)
    return s


def _is_pending(desc_raw: str | None) -> bool:
    """Detect if transaction is pending based on description markers."""
    s = (desc_raw or "").lower()
    return s.startswith("processing") or "(pending)" in s


def _parse_bank_export_rows(rows: list[dict]) -> Iterator[dict]:
    """Parse bank export v1 format rows into transaction data.

    Format: Date,Description,Comments,Check Number,Amount,Balance
    Example: 11/12/2025,"APPLE.COM/BILL",,"","-$2.99",""
    """
    for row in rows:
        # Parse date and amount - skip if either is invalid
        tx_date = _parse_bank_date(row.get("date"))
        amount = _parse_bank_amount(row.get("amount"))

        if not tx_date or amount is None:
            # Skip header/empty/malformed rows
            continue

        desc_raw = row.get("description") or ""
        description = _clean_bank_description(desc_raw)
        merchant = _extract_bank_merchant(desc_raw)
        month = tx_date.strftime("%Y-%m")
        pending = _is_pending(desc_raw)

        # Convert Decimal to float for consistency with existing code
        yield {
            "date": tx_date,
            "amount": float(amount),
            "description": description,
            "merchant": merchant,
            "account": None,  # Bank export doesn't have account column
            "category": None,  # Will be filled by ML
            "month": month,
            "pending": pending,
        }


def _parse_bank_debit_credit_rows(rows: list[dict]) -> Iterator[dict]:
    """Parse bank debit/credit format rows.

    Format: Date,Description,Debit,Credit,Balance[,Status]
    Example: 11/01/2025,STARBUCKS #1234,4.75,,1200.25

    Rules:
    - If Debit has value → negative amount
    - If Credit has value → positive amount
    - amount = credit - debit
    - If Status column exists and == "Pending" → pending=True
    """
    for row in rows:
        tx_date = _parse_bank_date(row.get("date"))
        debit = _parse_bank_amount(row.get("debit"))
        credit = _parse_bank_amount(row.get("credit"))

        if not tx_date:
            continue
        if debit is None and credit is None:
            continue

        # Calculate net amount: credit - debit
        amount = (credit or Decimal("0")) - (debit or Decimal("0"))

        desc_raw = row.get("description") or ""
        description = _clean_bank_description(desc_raw)
        merchant = _extract_bank_merchant(desc_raw)
        month = tx_date.strftime("%Y-%m")

        # Check for pending status (via Status column or description markers)
        status = (row.get("status") or "").lower()
        pending = status == "pending" or _is_pending(desc_raw)

        yield {
            "date": tx_date,
            "amount": float(amount),
            "description": description,
            "merchant": merchant,
            "account": None,
            "category": None,
            "month": month,
            "pending": pending,
        }


def _parse_bank_posted_effective_rows(rows: list[dict]) -> Iterator[dict]:
    """Parse bank posted/effective date format rows.

    Format: Posted Date,Effective Date,Description,Amount,Type,Balance
    Example: 11/03/2025,11/02/2025,VENMO PAYMENT,-25.00,DEBIT,3675.25

    Uses Posted Date as primary date, falls back to Effective Date.
    If Posted Date is empty but Effective Date exists → mark as pending.
    """
    for row in rows:
        # Try Posted Date first, then Effective Date
        posted_date = _parse_bank_date(row.get("posted date"))
        effective_date = _parse_bank_date(row.get("effective date"))
        tx_date = posted_date or effective_date
        amount = _parse_bank_amount(row.get("amount"))

        if not tx_date or amount is None:
            continue

        desc_raw = row.get("description") or ""
        description = _clean_bank_description(desc_raw)
        merchant = _extract_bank_merchant(desc_raw)
        month = tx_date.strftime("%Y-%m")

        # If no posted date but has effective date, likely pending
        # Also check description markers
        pending = (posted_date is None and effective_date is not None) or _is_pending(
            desc_raw
        )

        yield {
            "date": tx_date,
            "amount": float(amount),
            "description": description,
            "merchant": merchant,
            "account": None,
            "category": None,
            "month": month,
            "pending": pending,
        }


def _parse_generic_rows(rows: list[dict], flip: bool) -> Iterator[dict]:
    """Parse generic LedgerMind CSV format rows."""
    for row in rows:
        # Parse date
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

        yield {
            "date": date,
            "amount": amount,
            "description": desc,
            "merchant": merch,
            "account": acct,
            "category": raw_cat,
            "month": month,
            "pending": False,  # Generic format doesn't have pending markers
        }


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
    response: Response,
    user_id: int = Depends(get_current_user_id),
    file: UploadFile = File(...),
    replace: bool = Query(False),
    expenses_are_positive: bool | None = Query(None),  # <-- now optional
    format: str = Query("csv"),  # format from frontend: csv|xls|xlsx
    db: Session = Depends(get_db),
):
    """
    Ingest CSV; if `expenses_are_positive` is None, auto-detect and flip if needed.
    Expected columns: date, amount, merchant, description, category? (category optional)

    **Important**: When `replace=True`, only transaction data is deleted.
    ML training data (feedback, rules) is preserved for continuous learning.
    """
    # Generate request ID for structured logging
    request_id = uuid4().hex

    # Track all ingest requests for SLO monitoring
    phase = "replace" if replace else "append"
    INGEST_REQUESTS.labels(phase=phase).inc()

    # Track file format for observability (normalize to lowercase)
    file_format = format.lower() if format in ("csv", "xls", "xlsx") else "csv"
    INGEST_FILES.labels(format=file_format).inc()

    # Log start of ingest operation
    logger.info(
        "ingest.start",
        extra={
            "request_id": request_id,
            "user_id": user_id,
            "uploaded_filename": file.filename,
            "replace": replace,
            "file_format": file_format,
        },
    )

    # Wrap main handler in try-catch for comprehensive error logging
    try:
        result = await _ingest_csv_impl(
            user_id=user_id,
            file=file,
            replace=replace,
            expenses_are_positive=expenses_are_positive,
            db=db,
            phase=phase,
        )

        # Log successful ingest
        logger.info(
            "ingest.success",
            extra={
                "request_id": request_id,
                "user_id": user_id,
                "added": result.get("added", 0),
                "duplicates": result.get("duplicates", 0),
            },
        )

        # Issue CSRF cookie on successful upload so subsequent operations (like reset) work
        issue_csrf_cookie(response)

        return result

    except Exception as exc:
        INGEST_ERRORS.labels(phase=phase).inc()

        # Log unexpected error with request_id for traceability
        logger.error(
            "ingest.unexpected_error",
            extra={
                "request_id": request_id,
                "user_id": user_id,
                "csv_filename": file.filename,
                "replace": replace,
                "error_type": type(exc).__name__,
                "error_message": str(exc),
            },
            exc_info=True,
        )

        # Build user-friendly error message
        error_str = str(exc)
        if "could not convert string to float" in error_str:
            friendly_message = "Some rows have invalid amounts. Please ensure all amounts are valid numbers (e.g., -123.45 or $123.45)."
        elif "time data" in error_str or "does not match format" in error_str:
            friendly_message = "Some rows have invalid dates. Please use MM/DD/YYYY or YYYY-MM-DD format."
        elif "invalid literal" in error_str:
            friendly_message = "Some rows have invalid data. Please check that dates and amounts are correctly formatted."
        else:
            # Generic error with request_id for support
            friendly_message = f"Ingest failed – please check logs and try again (request_id: {request_id})"

        # Return 500 with HTTPException
        raise HTTPException(
            status_code=500,
            detail={
                "ok": False,
                "error": "ingest_failed",
                "error_type": type(exc).__name__,
                "message": friendly_message,
                "request_id": request_id,
            },
        )


async def _ingest_csv_impl(
    user_id: int,
    file: UploadFile,
    replace: bool,
    expenses_are_positive: bool | None,
    db: Session,
    phase: str,
):
    """Internal implementation of CSV ingest logic."""

    if replace:
        # Delete transactions; DB cascades handle cleanup:
        # - suggestion_events deleted via FK CASCADE
        # - suggestion_feedback.event_id set to NULL via FK SET NULL
        # - rules, merchant_overrides remain intact
        try:
            db.query(Transaction).filter(Transaction.user_id == user_id).delete()
            db.commit()
        except Exception:
            # Track replace failures for monitoring/alerting
            INGEST_ERRORS.labels(phase="replace").inc()
            raise
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

    # Normalize headers to lowercase for case-insensitive matching
    if reader.fieldnames:
        original_headers = reader.fieldnames.copy()
        reader.fieldnames = [h.lower().strip() if h else h for h in reader.fieldnames]
    else:
        original_headers = None

    rows = list(reader)

    # Detect CSV format based on headers
    csv_format = detect_csv_format(reader.fieldnames)

    # DEBUG: Log CSV headers to diagnose column mismatch issues
    logger.info(
        f"CSV format={csv_format.value} | headers: {original_headers} (normalized to: {reader.fieldnames}) | rows_count={len(rows)} | (user_id={user_id}, filename={file.filename})"
    )

    # Check for unknown format
    if csv_format == CsvFormat.UNKNOWN:
        logger.warning(
            f"CSV ingest: unrecognized format (user_id={user_id}, headers={original_headers})"
        )

        # Normalize headers for frontend display (same logic as above)
        headers_norm = (
            [h.lower().strip() if h else h for h in original_headers]
            if original_headers
            else []
        )

        return {
            "ok": False,
            "added": 0,
            "count": 0,
            "flip_auto": False,
            "detected_month": None,
            "date_range": None,
            "error": "unknown_format",
            "headers_found": headers_norm,  # Structured list for UI
            "message": "CSV format not recognized.",  # Short message; UI will elaborate
        }

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

    # Parse rows based on detected format
    if csv_format == CsvFormat.BANK_EXPORT_V1:
        parsed_rows = _parse_bank_export_rows(rows)
        flip = False  # Bank format doesn't need flipping
    elif csv_format == CsvFormat.BANK_DEBIT_CREDIT:
        parsed_rows = _parse_bank_debit_credit_rows(rows)
        flip = False  # Debit/credit already determines sign
    elif csv_format == CsvFormat.BANK_POSTED_EFFECTIVE:
        parsed_rows = _parse_bank_posted_effective_rows(rows)
        flip = False  # Posted/effective format handles sign
    else:  # GENERIC
        # Try to infer expense sign flip if not provided
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

        parsed_rows = _parse_generic_rows(rows, flip)

    # Build dedup key set from existing DB transactions in the date range
    # This prevents hitting the unique constraint by detecting duplicates up front

    # Find min/max dates from parsed rows for efficient DB query
    parsed_list = list(parsed_rows)  # Materialize generator
    if not parsed_list:
        # No valid rows parsed
        logger.warning(f"CSV ingest: no valid rows after parsing (user_id={user_id})")
        return {
            "ok": False,
            "added": 0,
            "count": 0,
            "duplicates": 0,
            "flip_auto": False,
            "detected_month": None,
            "date_range": None,
            "error": "no_rows_parsed",
            "message": "No valid transactions could be parsed from the file.",
        }

    min_date = min(r["date"] for r in parsed_list)
    max_date = max(r["date"] for r in parsed_list)

    # Get months covered by CSV for replace mode
    months_in_csv = {r["month"] for r in parsed_list if r.get("month")}

    # If replace mode, delete all existing transactions for these months
    if replace and months_in_csv:
        deleted_count = db.execute(
            delete(Transaction).where(
                Transaction.user_id == user_id,
                Transaction.month.in_(months_in_csv),
            )
        ).rowcount
        db.commit()
        logger.info(
            f"Replace mode: deleted {deleted_count} existing transactions for months {months_in_csv} (user_id={user_id})"
        )

    # Query existing transactions in date range to build dedup set
    existing_txns = db.execute(
        select(Transaction.date, Transaction.amount, Transaction.description).where(
            Transaction.user_id == user_id,
            Transaction.date >= min_date,
            Transaction.date <= max_date,
        )
    ).all()

    existing_keys = set()
    for txn_date, txn_amount, txn_desc in existing_txns:
        norm_desc = (txn_desc or "").strip().lower()
        existing_keys.add((txn_date, txn_amount, norm_desc))

    # Track duplicates and new transactions
    seen_keys = set(existing_keys)
    duplicates = 0
    new_transactions = []

    for row_data in parsed_list:
        date = row_data["date"]
        amount = row_data["amount"]
        desc = row_data["description"]
        merch = row_data["merchant"]
        acct = row_data["account"]
        raw_cat = row_data["category"]
        month = row_data["month"]
        pending = row_data.get("pending", False)

        # Track date range for detected_month
        if earliest_date is None or date < earliest_date:
            earliest_date = date
        if latest_date is None or date > latest_date:
            latest_date = date

        # Check for duplicates using dedup key
        norm_desc = (desc or "").strip().lower()
        dedup_key = (date, amount, norm_desc)

        if dedup_key in seen_keys:
            duplicates += 1
            continue

        seen_keys.add(dedup_key)

        # If CSV provides a category, normalize and use it (for demo mode)
        # Otherwise leave as None for ML categorization
        normalized_cat = normalize_category(raw_cat) if raw_cat else None

        new_transactions.append(
            Transaction(
                user_id=user_id,
                date=date,
                amount=amount,
                description=desc,
                merchant=merch,
                account=acct,
                raw_category=raw_cat,
                month=month,
                category=normalized_cat,
                pending=pending,
            )
        )

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

    # Check if all rows were duplicates
    if not new_transactions and duplicates > 0:
        logger.info(
            f"CSV ingest: all {duplicates} rows were duplicates (user_id={user_id})"
        )
        return {
            "ok": False,
            "added": 0,
            "count": len(parsed_list),
            "duplicates": duplicates,
            "flip_auto": flip and (expenses_are_positive is None),
            "detected_month": None,
            "date_range": None,
            "error": "all_rows_duplicate",
            "message": f"File contained {len(parsed_list)} transactions but all of them already exist in your ledger. No new transactions were added. Try enabling 'Replace existing data' to re-import.",
        }

    # Bulk insert new transactions with IntegrityError safety net
    if new_transactions:
        try:
            db.add_all(new_transactions)
            db.commit()
            added = len(new_transactions)
        except Exception as exc:
            from sqlalchemy.exc import IntegrityError

            db.rollback()
            if isinstance(exc, IntegrityError) and "uq_txn_dedup" in str(exc.orig):
                # Defensive guard: some duplicates slipped through
                logger.error(
                    f"Duplicate constraint hit despite dedup logic (user_id={user_id})",
                    exc_info=True,
                )
                return {
                    "ok": False,
                    "added": 0,
                    "count": len(parsed_list),
                    "duplicates": duplicates,
                    "error": "duplicate_constraint",
                    "message": "Some transactions in this file conflict with existing data (duplicate transactions). Try enabling 'Replace existing data' or upload a file without already-imported entries.",
                }
            # Re-raise for truly unexpected DB errors
            raise
    else:
        added = 0

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

    # Handle zero-row ingest as a warning/error case
    if added == 0 and len(rows) > 0:
        # File had rows but none were parsed successfully
        logger.warning(
            f"CSV ingest: {len(rows)} rows in file, but no valid transactions could be parsed (user_id={user_id}, headers={original_headers})"
        )

        # Build helpful error message showing actual vs expected headers

        # Build user-friendly error message
        if csv_format == CsvFormat.UNKNOWN:
            # Headers not recognized
            headers_str = ", ".join(original_headers) if original_headers else "none"
            message = (
                f"Could not recognize CSV format. Your file has columns: {headers_str}. "
                f"Please use a CSV with at least 'date' and 'amount' columns. "
                f"Supported formats include standard bank exports or simple date/amount files."
            )
        else:
            # Headers recognized but all rows failed parsing
            message = (
                f"File format recognized, but all {len(rows)} rows had invalid data. "
                f"Please check that dates are in a valid format (MM/DD/YYYY or YYYY-MM-DD) "
                f"and amounts are numbers (e.g., -123.45 or $123.45)."
            )

        return {
            "ok": False,
            "added": 0,
            "count": 0,
            "flip_auto": flip and (expenses_are_positive is None),
            "detected_month": None,
            "date_range": None,
            "error": "no_rows_parsed",
            "message": message,
        }
    elif added == 0 and len(rows) == 0:
        # Empty file or only headers
        logger.warning(f"CSV ingest: empty file or headers only (user_id={user_id})")
        return {
            "ok": False,
            "added": 0,
            "count": 0,
            "flip_auto": False,
            "detected_month": None,
            "date_range": None,
            "error": "empty_file",
            "message": "CSV file is empty or contains only headers.",
        }

    # include both keys for compatibility
    result = {
        "ok": True,
        "added": added,
        "count": len(parsed_list),
        "duplicates": duplicates,
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

    # Success logging for production debugging
    logger.info(
        f"CSV ingest SUCCESS: user_id={user_id}, added={added}, duplicates={duplicates}, "
        f"detected_month={detected_month}, "
        f"date_range={earliest_date.isoformat() if earliest_date else None} to "
        f"{latest_date.isoformat() if latest_date else None}, "
        f"replace={replace}, flip_auto={flip}, "
        f"total_rows_in_file={len(rows)}, "
        f"filename={file.filename}"
    )

    return result


@router.put("")
async def ingest_csv_put(
    response: Response,
    file: UploadFile = File(...),
    replace: bool = Query(False),
    expenses_are_positive: bool | None = Query(None),
    db: Session = Depends(get_db),
):
    """PUT alias for ingest to support idempotent clients; delegates to POST handler."""
    return await ingest_csv(
        response=response,
        file=file,
        replace=replace,
        expenses_are_positive=expenses_are_positive,
        db=db,
    )


@router.head("")
async def ingest_head():
    """Health/lightweight check for ingest endpoint; no body returned."""
    return Response(status_code=204, headers={"Cache-Control": "no-store"})


@router.delete("/dashboard/reset", dependencies=[Depends(csrf_protect)])
async def dashboard_reset(
    request: Request,
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Delete all transactions for the current user (dashboard reset).

    This preserves ML training data (feedback, rules) for continuous learning.
    """
    request_id = uuid4().hex

    logger.info(
        "reset_dashboard called (DELETE)",
        extra={
            "request_id": request_id,
            "path": request.url.path,
            "method": request.method,
            "user_id": user_id,
            "cookies": list(request.cookies.keys()),
            "has_csrf_header": "x-csrf-token"
            in {k.lower(): v for k, v in request.headers.items()},
        },
    )

    logger.info(
        "dashboard.reset.start",
        extra={
            "request_id": request_id,
            "user_id": user_id,
        },
    )

    try:
        # Delete all user transactions (CASCADE will handle related records)
        deleted_txns = db.execute(
            delete(Transaction).where(Transaction.user_id == user_id)
        ).rowcount

        db.commit()

        # Clear legacy in-memory state if present
        try:
            from ..main import app

            app.state.txns = []
        except Exception:
            pass

        logger.info(
            "dashboard.reset.success",
            extra={
                "request_id": request_id,
                "user_id": user_id,
                "deleted_transactions": deleted_txns,
            },
        )

        return {"ok": True, "deleted": deleted_txns}

    except Exception as exc:
        db.rollback()

        logger.error(
            "dashboard.reset.error",
            extra={
                "request_id": request_id,
                "user_id": user_id,
                "error_type": type(exc).__name__,
                "error_message": str(exc),
            },
            exc_info=True,
        )

        raise HTTPException(
            status_code=500,
            detail=f"Ingest failed – please check logs and try again (request_id: {request_id})",
        )


@router.post("/dashboard/reset", dependencies=[Depends(csrf_protect)])
async def dashboard_reset_post(
    request: Request,
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """POST alias for dashboard reset (compatibility with proxies/WAFs)."""
    logger.info("reset_dashboard called via POST, delegating to DELETE handler")
    return await dashboard_reset(request=request, user_id=user_id, db=db)
