from __future__ import annotations

from dataclasses import dataclass, asdict
from datetime import date, datetime
from decimal import Decimal, ROUND_HALF_UP
from typing import Any, Dict, Optional, Union
import uuid

DateLike = Union[date, datetime, str]


def _quantize_amount(value: Any) -> float:
    dec = Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    return float(dec)


def _normalize_currency(value: Optional[str]) -> str:
    cur = (value or "USD").strip().upper()
    if len(cur) != 3 or not cur.isalpha():
        raise ValueError(f"currency must be 3-letter ISO code, got {value!r}")
    return cur


def _normalize_date(d: Optional[DateLike]) -> date:
    if d is None:
        return date.today()
    if isinstance(d, datetime):
        return d.date()
    if isinstance(d, date):
        return d
    s = str(d).strip()
    if len(s) == 10 and s[4] == "-" and s[7] == "-":
        return date.fromisoformat(s)
    try:
        return datetime.fromisoformat(s).date()
    except Exception:
        return date.today()


@dataclass
class Txn:
    id: str
    account_id: str
    date: str
    month: str
    description: str
    amount: float
    currency: str
    category: Optional[str] = None
    merchant: Optional[str] = None
    raw: Optional[Dict[str, Any]] = None


def create_txn(
    client: Any | None = None,
    *,
    account_id: str = "acc_test",
    date_: Optional[DateLike] = None,
    description: str = "Test transaction",
    amount: float = -12.34,
    currency: str = "USD",
    category: Optional[str] = None,
    merchant: Optional[str] = None,
    id: Optional[str] = None,
    raw: Optional[Dict[str, Any]] = None,
    **overrides: Any,
) -> Dict[str, Any]:
    d = _normalize_date(date_)
    payload = Txn(
        id=id or str(uuid.uuid4()),
        account_id=account_id,
        date=d.isoformat(),
        month=f"{d.year:04d}-{d.month:02d}",
        description=description,
        amount=_quantize_amount(amount),
        currency=_normalize_currency(currency),
        category=category,
        merchant=merchant,
        raw=raw,
    )
    txd: Dict[str, Any] = asdict(payload)
    if overrides:
        txd.update(overrides)
        if "date" in overrides and "month" not in overrides:
            d2 = _normalize_date(overrides["date"])
            txd["month"] = f"{d2.year:04d}-{d2.month:02d}"
        if "currency" in overrides:
            txd["currency"] = _normalize_currency(overrides["currency"])
        if "amount" in overrides:
            txd["amount"] = _quantize_amount(overrides["amount"])
    return txd
