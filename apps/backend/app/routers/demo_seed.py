"""
Demo seed endpoint - idempotent sample data reset.

Provides a clean way to reset demo data without duplicates.
Clears existing demo transactions and reseeds from demo-sample.csv.
"""

import logging
import csv
from pathlib import Path
from datetime import datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Header, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy import delete
from sqlalchemy.orm import Session

from app.db import get_db
from app.orm_models import Transaction, User
from app.utils.auth import get_current_user
from app.core.category_mappings import normalize_category

logger = logging.getLogger("demo.seed")
router = APIRouter(tags=["demo"])


def seed_demo_data_for_user(user_id: int, db: Session) -> int:
    """
    Seed demo data for a specific user (used for new user auto-seeding).

    Args:
        user_id: The user ID to seed data for
        db: Database session

    Returns:
        Number of transactions added

    Raises:
        Exception: If seeding fails
    """
    try:
        # Clear any existing demo transactions first
        delete_stmt = delete(Transaction).where(
            Transaction.user_id == user_id,
            Transaction.is_demo == True,  # noqa: E712
        )
        db.execute(delete_stmt)

        # Load demo CSV
        demo_rows = load_demo_csv()

        # Insert new demo transactions
        added_count = 0
        for row in demo_rows:
            txn = Transaction(
                user_id=user_id,
                date=row["date"],
                month=row["month"],
                merchant=row["merchant"],
                merchant_canonical=row["merchant_canonical"],
                description=row["description"],
                amount=row["amount"],
                category=row["category"],
                raw_category=row["raw_category"],
                pending=row["pending"],
                is_demo=True,
            )
            db.add(txn)
            added_count += 1

        db.commit()
        logger.info(
            f"Auto-seeded {added_count} demo transactions for new user {user_id}"
        )
        return added_count
    except Exception as e:
        logger.error(f"Failed to auto-seed demo data for user {user_id}: {e}")
        db.rollback()
        # Don't raise - let user continue even if demo seed fails
        return 0


class DemoSeedResponse(BaseModel):
    """Response from demo seed endpoint."""

    ok: bool
    transactions_cleared: int
    transactions_added: int
    months_seeded: list[str]
    txns_count: int
    message: str


class DemoSampleTransaction(BaseModel):
    """Sample transaction for demo mode."""

    date: str
    merchant: str
    description: str
    amount: float
    category: str


def load_demo_csv() -> list[dict]:
    """
    Load demo-sample.csv from the web public directory.

    Returns:
        List of transaction dicts ready for insertion.

    Raises:
        FileNotFoundError: If demo CSV doesn't exist.
        ValueError: If CSV is malformed.
    """
    # Try multiple possible paths (backend copy or web public)
    possible_paths = [
        Path(__file__).parent.parent.parent / "data" / "demo-sample.csv",
        Path(__file__).parent.parent.parent.parent.parent
        / "web"
        / "public"
        / "demo-sample.csv",
    ]

    csv_path = None
    for path in possible_paths:
        if path.exists():
            csv_path = path
            break

    if not csv_path:
        raise FileNotFoundError(
            f"demo-sample.csv not found in any of: {[str(p) for p in possible_paths]}"
        )

    logger.info(f"Loading demo CSV from: {csv_path}")

    rows = []
    with open(csv_path, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)

        # Validate headers
        required_headers = {"date", "merchant", "description", "amount", "category"}
        if not reader.fieldnames:
            raise ValueError("CSV has no headers")

        headers = {h.strip().lower() for h in reader.fieldnames}
        missing = required_headers - headers
        if missing:
            raise ValueError(f"CSV missing required headers: {missing}")

        # Parse rows
        for row_num, row in enumerate(reader, start=2):  # Start at 2 (header is row 1)
            try:
                # Normalize column names (case-insensitive)
                row_norm = {k.strip().lower(): v.strip() for k, v in row.items()}

                # Parse date (YYYY-MM-DD format)
                date_str = row_norm["date"]
                txn_date = datetime.strptime(date_str, "%Y-%m-%d").date()

                # Parse amount (allow negative or positive floats)
                amount_str = row_norm["amount"].replace("$", "").replace(",", "")
                amount = Decimal(amount_str)

                # Normalize category
                raw_category = row_norm["category"]
                category = normalize_category(raw_category)

                rows.append(
                    {
                        "date": txn_date,
                        "month": txn_date.strftime("%Y-%m"),
                        "merchant": row_norm["merchant"],
                        "merchant_raw": row_norm["merchant"],
                        "merchant_canonical": row_norm["merchant"],
                        "description": row_norm.get(
                            "description", row_norm["merchant"]
                        ),
                        "amount": amount,
                        "category": category,
                        "raw_category": raw_category,
                        "pending": False,
                    }
                )
            except Exception as e:
                raise ValueError(
                    f"Error parsing CSV row {row_num}: {e}\nRow data: {row}"
                ) from e

    logger.info(f"Loaded {len(rows)} transactions from demo CSV")
    return rows


@router.get("/demo/sample")
async def get_demo_sample_data() -> list[DemoSampleTransaction]:
    """
    Return raw demo sample data without requiring authentication.

    This endpoint is used by the frontend to fetch sample transactions
    that can then be ingested via the normal /ingest flow.

    Returns:
        List of sample transactions in LedgerMind format.
    """
    try:
        demo_rows = load_demo_csv()

        # Convert to frontend-friendly format
        return [
            DemoSampleTransaction(
                date=(
                    row["date"].isoformat()
                    if hasattr(row["date"], "isoformat")
                    else str(row["date"])
                ),
                merchant=row["merchant"],
                description=row["description"],
                amount=float(row["amount"]),
                category=row[
                    "raw_category"
                ],  # Use raw_category since normalize_category() can return None
            )
            for row in demo_rows
        ]
    except FileNotFoundError:
        raise HTTPException(
            status_code=500,
            detail="Demo sample data file is missing.",
        )
    except Exception as e:
        logger.exception("Error loading demo sample")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to load demo sample: {str(e)}",
        )


@router.post("/demo/reset")
async def reset_demo_data(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Clear all demo data from the dedicated DEMO_USER_ID account.

    CRITICAL ARCHITECTURE NOTES:

    1. Data isolation:
       - Demo data lives under DEMO_USER_ID (constant in app.config)
       - This endpoint clears ONLY that account's transactions
       - Real user data (current_user.id) is NEVER affected

    2. Frontend flow:
       - Frontend calls this BEFORE /ingest/dashboard/reset
       - This ensures both demo and real user data are cleared
       - Order matters! See apps/web/src/components/UploadCsv.tsx reset()

    3. Why dedicated demo account:
       - Prevents demo data mixing with real user uploads
       - Frontend toggles lm:demoMode to view different user_id
       - No data migration needed - just switch which user_id to query

    See: tests/test_demo_seed_reset.py for regression coverage
         tests/test_ingest_reset.py for user data isolation tests

    This endpoint clears transactions from the shared demo user account (DEMO_USER_ID),
    which is used when users enable demo mode to view sample data.

    Deletes:
    - All transactions where user_id=DEMO_USER_ID and is_demo=True

    Note: This codebase has NO persistent aggregate tables.
    All analytics (month summaries, insights, charts) are computed on-the-fly
    from the Transaction table via app.services.insights_expanded.load_month().

    Returns:
        Simple success response with count of cleared transactions.
    """
    from app.config import DEMO_USER_ID

    try:
        # Clear demo transactions from the dedicated DEMO_USER_ID account
        # (matches the account that /demo/seed populates)
        delete_stmt = delete(Transaction).where(
            Transaction.user_id == DEMO_USER_ID,
            Transaction.is_demo == True,  # noqa: E712
        )
        result = db.execute(delete_stmt)
        cleared_count = result.rowcount  # type: ignore
        db.commit()

        logger.info(
            f"[demo/reset] Cleared {cleared_count} demo transactions from DEMO_USER_ID={DEMO_USER_ID}"
        )

        return {
            "ok": True,
            "transactions_cleared": cleared_count,
            "message": f"Demo data cleared successfully. Removed {cleared_count} transactions.",
        }
    except Exception as e:
        logger.exception("Unexpected error during demo reset")
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Failed to reset demo data: {str(e)}",
        )


@router.post("/demo/seed", response_model=DemoSeedResponse)
async def seed_demo_data(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    x_lm_demo_seed: str | None = Header(default=None, alias="X-LM-Demo-Seed"),
):
    """
    Idempotently seed demo data into the dedicated DEMO USER account.

    SECURITY: Requires X-LM-Demo-Seed: 1 header to prevent accidental/automatic seeding.
    Only the explicit "Use sample data" button should call this endpoint.

    IMPORTANT: This endpoint seeds data into the dedicated demo user (DEMO_USER_ID),
    NOT the current user's account. The frontend should switch to demo mode after
    calling this to view the seeded data.

    Steps:
    1. Verify X-LM-Demo-Seed header is present (403 if missing)
    2. Delete existing demo transactions for DEMO_USER_ID
    3. Load demo-sample.csv from backend
    4. Insert transactions with user_id=DEMO_USER_ID, is_demo=True, source='demo'

    This ensures:
    - No automatic demo seeding on page load or background processes
    - Demo data never pollutes real user accounts
    - Demo data is isolated from ML training (is_demo=True excluded)
    - Always provides fresh, consistent demo experience
    - Idempotent: can be called multiple times safely

    Returns:
        DemoSeedResponse with counts and status message.

    Raises:
        HTTPException 403: Missing X-LM-Demo-Seed header
    """
    from app.config import DEMO_USER_ID

    # SECURITY GATE: Require explicit header to prevent accidental seeding
    if x_lm_demo_seed != "1":
        logger.warning(
            "Blocked demo_seed call without header: user=%s path=%s referer=%s",
            current_user.id,
            request.url.path,
            request.headers.get("referer"),
        )
        return JSONResponse(
            status_code=403,
            content={
                "status": "forbidden",
                "reason": "missing_demo_seed_header",
                "message": "Demo seeding is only allowed via the demo controls.",
            },
        )

    try:
        # Step 1: Clear existing DEMO transactions for the demo user only
        delete_stmt = delete(Transaction).where(
            Transaction.user_id == DEMO_USER_ID,
            Transaction.is_demo == True,  # noqa: E712
        )
        result = db.execute(delete_stmt)
        cleared_count = result.rowcount  # type: ignore
        db.commit()

        logger.info(
            f"[demo/seed] DEMO_USER_ID={DEMO_USER_ID} cleared_count={cleared_count}"
        )

        # Step 2: Load demo CSV
        demo_rows = load_demo_csv()

        # Step 3: Insert new demo transactions for DEMO_USER_ID
        added_count = 0
        for row in demo_rows:
            txn = Transaction(
                user_id=DEMO_USER_ID,  # Always use dedicated demo user
                date=row["date"],
                month=row["month"],
                merchant=row["merchant"],
                merchant_canonical=row["merchant_canonical"],
                description=row["description"],
                amount=row["amount"],
                category=row["category"],
                raw_category=row["raw_category"],
                pending=row["pending"],
                is_demo=True,  # Mark as demo data (excluded from ML training)
                source="demo",  # Explicitly mark source as 'demo'
            )
            db.add(txn)
            added_count += 1

        db.commit()

        logger.info(
            f"[demo/seed] DEMO_USER_ID={DEMO_USER_ID} added_count={added_count} months_count={len(set(row['month'] for row in demo_rows))}"
        )

        # Get unique months from seeded data
        months_seeded = sorted(list(set(row["month"] for row in demo_rows)))

        return DemoSeedResponse(
            ok=True,
            transactions_cleared=cleared_count,
            transactions_added=added_count,
            months_seeded=months_seeded,
            txns_count=added_count,
            message=f"Demo data seeded successfully for demo user. Cleared {cleared_count} old transactions, added {added_count} new ones across {len(months_seeded)} months. Switch to demo mode to view.",
        )

    except FileNotFoundError as e:
        logger.error(
            f"[demo/seed] DEMO_USER_ID={DEMO_USER_ID} error=FileNotFoundError: {e}"
        )
        raise HTTPException(
            status_code=500,
            detail="Demo sample data file is missing. Please contact support.",
        )
    except ValueError as e:
        logger.error(f"[demo/seed] DEMO_USER_ID={DEMO_USER_ID} error=ValueError: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Demo sample data is malformed: {e}",
        )
    except Exception as e:
        logger.exception(
            f"[demo/seed] DEMO_USER_ID={DEMO_USER_ID} error=UnexpectedError"
        )
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Failed to seed demo data: {str(e)}",
        )
