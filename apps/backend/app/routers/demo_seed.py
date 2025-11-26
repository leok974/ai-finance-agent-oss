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

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import delete
from sqlalchemy.orm import Session

from app.db import get_db
from app.orm_models import Transaction, User
from app.utils.auth import get_current_user
from app.core.category_mappings import normalize_category

logger = logging.getLogger("demo.seed")
router = APIRouter(tags=["demo"])


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


@router.post("/demo/seed", response_model=DemoSeedResponse)
async def seed_demo_data(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Idempotently reset demo data for the current user.

    Steps:
    1. Delete all existing transactions where is_demo=True for this user
    2. Load demo-sample.csv from backend
    3. Insert transactions with is_demo=True

    This ensures:
    - No duplicate transaction errors
    - Demo data is isolated from ML training (is_demo=True excluded)
    - Always provides fresh, consistent demo experience

    Returns:
        DemoSeedResponse with counts and status message.
    """
    try:
        # Step 1: Clear existing demo transactions for this user
        delete_stmt = delete(Transaction).where(
            Transaction.user_id == current_user.id,
            Transaction.is_demo == True,  # noqa: E712
        )
        result = db.execute(delete_stmt)
        cleared_count = result.rowcount  # type: ignore
        db.commit()

        logger.info(
            f"Cleared {cleared_count} existing demo transactions for user {current_user.id}"
        )

        # Step 2: Load demo CSV
        demo_rows = load_demo_csv()

        # Step 3: Insert new demo transactions
        added_count = 0
        for row in demo_rows:
            txn = Transaction(
                user_id=current_user.id,
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
            )
            db.add(txn)
            added_count += 1

        db.commit()

        logger.info(f"Added {added_count} demo transactions for user {current_user.id}")

        # Get unique months from seeded data
        months_seeded = sorted(list(set(row["month"] for row in demo_rows)))

        return DemoSeedResponse(
            ok=True,
            transactions_cleared=cleared_count,
            transactions_added=added_count,
            months_seeded=months_seeded,
            txns_count=added_count,
            message=f"Demo data reset successfully. Cleared {cleared_count} old transactions, added {added_count} new ones across {len(months_seeded)} months.",
        )

    except FileNotFoundError as e:
        logger.error(f"Demo CSV not found: {e}")
        raise HTTPException(
            status_code=500,
            detail="Demo sample data file is missing. Please contact support.",
        )
    except ValueError as e:
        logger.error(f"Demo CSV parsing error: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Demo sample data is malformed: {e}",
        )
    except Exception as e:
        logger.exception("Unexpected error during demo seed")
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Failed to seed demo data: {str(e)}",
        )
