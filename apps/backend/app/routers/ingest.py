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
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from app.deps.auth_guard import get_current_user_id
from sqlalchemy import select, update
from io import TextIOWrapper
import csv
import datetime as dt
import logging
import re
from decimal import Decimal, InvalidOperation
from enum import Enum
from typing import Iterator
from ..db import get_db
from app.transactions import Transaction
from app.services.ingest_utils import detect_positive_expense_format
from app.services.metrics import INGEST_REQUESTS, INGEST_ERRORS

logger = logging.getLogger(__name__)


class CsvFormat(str, Enum):
    """Supported CSV formats for transaction import."""
    GENERIC = "generic"                    # LedgerMind sample format
    BANK_EXPORT_V1 = "bank_v1"            # Date,Description,Comments,Check Number,Amount,Balance
    BANK_DEBIT_CREDIT = "bank_dc"         # Date,Description,Debit,Credit,Balance
    BANK_POSTED_EFFECTIVE = "bank_pe"     # Posted Date,Effective Date,Description,Amount,Type,Balance
    UNKNOWN = "unknown"


def detect_csv_format(fieldnames: list[str] | None) -> CsvFormat:
    """Detect CSV format based on headers."""
    if not fieldnames:
        return CsvFormat.UNKNOWN
    
    headers = [h.strip().lower() for h in fieldnames]
    header_set = set(headers)
    
    # Bank export v1: Date,Description,Comments,Check Number,Amount,Balance
    bank_v1_headers = {"date", "description", "comments", "check number", "amount", "balance"}
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
            s = s[len(prefix):].strip()
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
        pending = (posted_date is None and effective_date is not None) or _is_pending(desc_raw)
        
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
    user_id: int = Depends(get_current_user_id),
    file: UploadFile = File(...),
    replace: bool = Query(False),
    expenses_are_positive: bool | None = Query(None),  # <-- now optional
    db: Session = Depends(get_db),
):
    """
    Ingest CSV; if `expenses_are_positive` is None, auto-detect and flip if needed.
    Expected columns: date, amount, merchant, description, category? (category optional)

    **Important**: When `replace=True`, only transaction data is deleted.
    ML training data (feedback, rules) is preserved for continuous learning.
    """
    # Track all ingest requests for SLO monitoring
    phase = "replace" if replace else "append"
    INGEST_REQUESTS.labels(phase=phase).inc()

    # Wrap main handler in try-catch for comprehensive error logging
    try:
        return await _ingest_csv_impl(
            user_id=user_id,
            file=file,
            replace=replace,
            expenses_are_positive=expenses_are_positive,
            db=db,
            phase=phase,
        )
    except Exception as exc:
        INGEST_ERRORS.labels(phase=phase).inc()
        logger.exception(
            "CSV ingest failed",
            extra={
                "user_id": user_id,
                "filename": file.filename,
                "replace": replace,
                "error_type": type(exc).__name__,
            },
        )
        # Return 500 with detailed error for debugging
        return JSONResponse(
            status_code=500,
            content={
                "ok": False,
                "error": "ingest_failed",
                "error_type": type(exc).__name__,
                "message": f"CSV ingest failed: {str(exc)}",
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
        
        return {
            "ok": False,
            "added": 0,
            "count": 0,
            "flip_auto": False,
            "detected_month": None,
            "date_range": None,
            "error": "unknown_format",
            "message": f"CSV format not recognized. Headers found: {original_headers}. "
                      f"Supported formats:\n"
                      f"1. Generic LedgerMind: date, amount, description (optional: merchant, memo, account, category)\n"
                      f"2. Bank Export v1: Date, Description, Comments, Check Number, Amount, Balance\n"
                      f"3. Bank Debit/Credit: Date, Description, Debit, Credit, Balance\n"
                      f"4. Bank Posted/Effective: Posted Date, Effective Date, Description, Amount, Type, Balance",
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

    for row_data in parsed_rows:
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

        # check dupes (date, amount, description)
        exists = db.execute(
            select(Transaction.id).where(
                Transaction.user_id == user_id,
                Transaction.date == date,
                Transaction.amount == amount,
                Transaction.description == desc,
            )
        ).first()
        if exists:
            continue

        db.add(
            Transaction(
                user_id=user_id,
                date=date,
                amount=amount,
                description=desc,
                merchant=merch,
                account=acct,
                raw_category=raw_cat,
                month=month,  # ensure month is set on insert
                category=None,
                pending=pending,
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

    # Handle zero-row ingest as a warning/error case
    if added == 0 and len(rows) > 0:
        # File had rows but none were parsed successfully
        logger.warning(
            f"CSV ingest: {len(rows)} rows in file, but no valid transactions could be parsed (user_id={user_id}, headers={original_headers})"
        )
        
        # Build helpful error message showing actual vs expected headers
        supported_formats = [
            "date, amount, description, merchant (generic)",
            "date, description, amount (minimal)"
        ]
        
        return {
            "ok": False,
            "added": 0,
            "count": 0,
            "flip_auto": flip and (expenses_are_positive is None),
            "detected_month": None,
            "date_range": None,
            "error": "no_rows_parsed",
            "message": f"File contained {len(rows)} rows but no valid transactions could be parsed. "
                      f"Headers found: {original_headers}. "
                      f"Required columns: date, amount. "
                      f"Optional columns: description, merchant, memo, account, category. "
                      f"Note: Column names are case-insensitive.",
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

    # Success logging for production debugging
    logger.info(
        f"CSV ingest SUCCESS: user_id={user_id}, added={added}, "
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
