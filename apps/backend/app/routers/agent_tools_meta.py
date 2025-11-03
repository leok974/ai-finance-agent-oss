from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func, select
from typing import Optional, Any
from pydantic import BaseModel, Field
from typing import Annotated
from app.db import get_db
from app.orm_models import Transaction
import subprocess
import logging
from datetime import date as _date, datetime as _dt
from prometheus_client import Counter

logger = logging.getLogger(__name__)

# --- Metrics ---------------------------------------------------------------
meta_latest_month_null = Counter(
    "meta_latest_month_null_total",
    "latest_month endpoint returned null (no transactions or uncoercible values)",
)

# --- Pydantic Schemas ------------------------------------------------------
MonthStr = Annotated[str, Field(pattern=r"^\d{4}-\d{2}$")]  # e.g. 2025-09


class LatestMonthResponse(BaseModel):
    month: Optional[MonthStr] = None


router = APIRouter(prefix="/agent/tools/meta", tags=["agent_tools.meta"])


def _coerce_any_to_month(value: Any) -> Optional[str]:
    """Best‑effort convert an arbitrary DB MAX(date) result into YYYY-MM.

    Handles:
      - date / datetime objects (strftime)
      - ISO strings 'YYYY-MM-DD' or 'YYYY-MM-DDTHH:MM:SS' (slice first 7)
      - Already truncated 'YYYY-MM'
    Returns None if it cannot confidently coerce.
    """
    try:
        if value is None:
            return None
        # Native date/datetime
        if isinstance(value, (_date, _dt)):
            return value.strftime("%Y-%m")
        # Bytes from some DB adapters
        if isinstance(value, (bytes, bytearray)):
            value = value.decode("utf-8", "ignore")
        if isinstance(value, str):
            # Quick sanity: minimum length 7 for YYYY-MM
            if len(value) >= 7 and value[4] == "-":
                return value[:7]
        return None
    except Exception:
        return None


def _compute_month_sql(db: Session) -> Optional[str]:
    """Compute latest month using pure SQL.

    Rules:
      * If there are no transactions -> return None.
      * Compute both max(date) and max(month) and choose the lexicographically larger
        valid YYYY-MM (defensive: inconsistent data could exist during migrations).
    """
    try:
        dialect = db.bind.dialect.name  # type: ignore[attr-defined]
        max_date_month: Optional[str] = None
        if dialect == "postgresql":
            max_date_val = db.execute(select(func.max(Transaction.date))).scalar()
            if max_date_val:
                max_date_month = _coerce_any_to_month(max_date_val)
        else:
            # SQLite path: use max(date) then coerce
            max_date_val = db.execute(select(func.max(Transaction.date))).scalar()
            if max_date_val:
                max_date_month = _coerce_any_to_month(max_date_val)

        max_month_col = db.execute(select(func.max(Transaction.month))).scalar()
        max_month_col = _coerce_any_to_month(max_month_col)

        candidates = [m for m in (max_date_month, max_month_col) if m]
        if not candidates:
            return None
        # Lexicographically compare YYYY-MM (works because zero padded)
        return sorted(candidates)[-1]
    except Exception as e:  # pragma: no cover
        logger.warning("_compute_month_sql failure", exc_info=e)
        return None


@router.post("/latest_month", response_model=LatestMonthResponse)
async def latest_month_post(db: Session = Depends(get_db)) -> LatestMonthResponse:
    month = _compute_month_sql(db)
    if month is None:
        meta_latest_month_null.inc()
        logger.warning(
            "latest_month returned null (empty dataset or no valid date/month)"
        )
    return LatestMonthResponse(month=month)


@router.get(
    "/latest_month", include_in_schema=False, response_model=LatestMonthResponse
)
async def latest_month_get_compat(db: Session = Depends(get_db)) -> LatestMonthResponse:
    # Delegate to POST implementation for unified logic
    return await latest_month_post(db)


@router.post("/version")
def version(_: dict | None = None, db: Session = Depends(get_db)):
    try:
        branch = (
            subprocess.check_output(["git", "rev-parse", "--abbrev-ref", "HEAD"])
            .decode()
            .strip()
        )
    except Exception:
        branch = None
    try:
        sha = (
            subprocess.check_output(["git", "rev-parse", "--short", "HEAD"])
            .decode()
            .strip()
        )
    except Exception:
        sha = None
    return {"branch": branch, "commit": sha}
