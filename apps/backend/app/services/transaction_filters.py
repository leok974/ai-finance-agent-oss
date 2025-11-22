"""Shared transaction filtering logic for exports and queries."""

from dataclasses import dataclass
from decimal import Decimal
from typing import Optional

from sqlalchemy import and_, or_
from sqlalchemy.orm import Query

from app.transactions import Transaction


@dataclass
class ExportFilters:
    """Filters for transaction exports (Excel/PDF).

    These filters mirror the UI's transaction table filters:
    - category: filter by category slug
    - min_amount/max_amount: amount bounds (inclusive)
    - search: text search in description/merchant
    """

    category_slug: Optional[str] = None
    min_amount: Optional[Decimal] = None
    max_amount: Optional[Decimal] = None
    search: Optional[str] = None

    def is_active(self) -> bool:
        """Check if any filters are active."""
        return any(
            [
                self.category_slug is not None,
                self.min_amount is not None,
                self.max_amount is not None,
                self.search is not None,
            ]
        )


def apply_export_filters(query: Query, filters: ExportFilters) -> Query:
    """Apply export filters to a transaction query.

    Args:
        query: SQLAlchemy query on Transaction
        filters: ExportFilters with optional category/amount/search filters

    Returns:
        Filtered query
    """
    if not filters:
        return query

    conditions = []

    # Category filter
    if filters.category_slug:
        conditions.append(Transaction.category == filters.category_slug)

    # Amount range filters
    if filters.min_amount is not None:
        conditions.append(Transaction.amount >= float(filters.min_amount))

    if filters.max_amount is not None:
        conditions.append(Transaction.amount <= float(filters.max_amount))

    # Search filter (case-insensitive substring match on description or merchant)
    if filters.search:
        like_pattern = f"%{filters.search}%"
        conditions.append(
            or_(
                Transaction.description.ilike(like_pattern),
                Transaction.merchant.ilike(like_pattern),
            )
        )

    # Apply all conditions
    if conditions:
        query = query.filter(and_(*conditions))

    return query
