# apps/backend/app/routers/admin_maintenance.py

from __future__ import annotations

from typing import Optional
import os

from fastapi import APIRouter, Depends, Query, Header, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.transactions import Transaction
from app.services.merchant_normalizer import normalize_merchant_for_category
from app.metrics import txn_categorized_total

router = APIRouter(prefix="/admin/maintenance", tags=["admin"])


def _admin_token() -> str | None:
    """Fetch ADMIN_TOKEN at request time."""
    return os.getenv("ADMIN_TOKEN")


class BackfillP2PResponse(BaseModel):
    dry_run: bool
    analyzed: int
    matched: int
    updated: int
    sample_merchants: list[str] = Field(default_factory=list)


@router.post("/backfill-p2p-transfers")
def backfill_p2p_transfers(
    dry_run: bool = Query(
        default=True, description="Preview changes without updating DB"
    ),
    month: Optional[str] = Query(default=None, description="Filter by month (YYYY-MM)"),
    max_rows: int = Query(default=10_000, ge=1, le=100_000, description="Safety limit"),
    x_admin_token: str | None = Header(None),
    db: Session = Depends(get_db),
) -> BackfillP2PResponse:
    """
    Bulk re-categorize transactions to use P2P / Transfers category.

    This endpoint:
    1. Scans transactions with merchant descriptions containing P2P keywords
    2. Normalizes them using the merchant_normalizer
    3. Updates category_slug to "transfers" if categoryHint is "transfers"

    Safety features:
    - dry_run=true by default (preview only)
    - max_rows limit (default 10,000)
    - month filtering for incremental backfills
    - SQL pre-filter with ILIKE for efficiency

    Example:
        POST /admin/maintenance/backfill-p2p-transfers?dry_run=true
        POST /admin/maintenance/backfill-p2p-transfers?dry_run=false&month=2024-11
    """
    # Check admin token
    token = _admin_token()
    if token and x_admin_token != token:
        raise HTTPException(status_code=401, detail="unauthorized")

    # Build query
    stmt = select(Transaction).where(
        Transaction.merchant_raw.ilike("%zelle%")
        | Transaction.merchant_raw.ilike("%venmo%")
        | Transaction.merchant_raw.ilike("%cash app%")
        | Transaction.merchant_raw.ilike("%paypal%")
        | Transaction.merchant_raw.ilike("%apple cash%")
        | Transaction.merchant_raw.ilike("%sq *%")
        | Transaction.merchant_raw.ilike("%sqc*%")
        | Transaction.merchant_raw.ilike("%now withdrawal%")
    )

    # Month filter
    if month:
        try:
            year, mon = map(int, month.split("-"))
            stmt = stmt.where((Transaction.year == year) & (Transaction.month == mon))
        except ValueError:
            pass  # Invalid format → skip filter

    stmt = stmt.limit(max_rows)
    result = db.execute(stmt)
    transactions = list(result.scalars().all())

    analyzed = len(transactions)
    matched = 0
    updated = 0
    sample_merchants: list[str] = []

    for txn in transactions:
        # Normalize merchant using sync version
        norm = normalize_merchant_for_category(txn.merchant_raw or "")

        # Only update if categoryHint is "transfers"
        if norm.category_hint == "transfers":
            matched += 1

            # Collect sample for response
            if len(sample_merchants) < 10:
                sample_merchants.append(
                    f"{(txn.merchant_raw or '')[:50]} → {norm.display} ({norm.kind})"
                )

            # Update transaction
            if not dry_run:
                txn.category_slug = "transfers"
                updated += 1

                # Increment Prometheus metric
                if txn_categorized_total:
                    try:
                        txn_categorized_total.labels(category="Transfers / P2P").inc()
                    except Exception:
                        pass  # Metrics optional

    # Commit if not dry-run
    if not dry_run and updated > 0:
        db.commit()

    return BackfillP2PResponse(
        dry_run=dry_run,
        analyzed=analyzed,
        matched=matched,
        updated=updated,
        sample_merchants=sample_merchants,
    )
