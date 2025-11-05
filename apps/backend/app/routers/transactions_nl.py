from __future__ import annotations

from calendar import monthrange
from dataclasses import replace
from datetime import date, datetime, timedelta
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db import get_db
from app.services.txns_nl_query import (
    NLQuery,
    DEFAULT_LIMIT,
    parse_nl_query,
    run_txn_query,
)
from app.utils.auth import get_current_user

router = APIRouter(
    prefix="/transactions",
    tags=["transactions-nl"],
    dependencies=[Depends(get_current_user)],
)


class TxnNLRequest(BaseModel):
    query: Optional[str] = None
    filters: Optional[Dict[str, Any]] = None


class TxnNLResponse(BaseModel):
    reply: str
    rephrased: bool = False
    meta: Dict[str, Any] = {}


def _parse_date(value: Any) -> Optional[date]:
    if value is None:
        return None
    if isinstance(value, date):
        return value
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, str) and value.strip():
        try:
            return datetime.strptime(value[:10], "%Y-%m-%d").date()
        except ValueError:
            return None
    return None


def _parse_float(value: Any) -> Optional[float]:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError) as exc:
        raise ValueError("Invalid amount filter") from exc


def _parse_int(
    value: Any, *, default: int, minimum: int = 1, maximum: Optional[int] = None
) -> int:
    if value is None or value == "":
        return default
    try:
        parsed = int(value)
    except (TypeError, ValueError) as exc:
        raise ValueError("Invalid numeric filter") from exc
    if parsed < minimum:
        parsed = minimum
    if maximum is not None and parsed > maximum:
        parsed = maximum
    return parsed


def _infer_preset_from_query(q: str) -> Optional[str]:
    q_low = q.lower()
    if "this month" in q_low:
        return "this_month"
    if "mtd" in q_low:
        return "mtd"
    return None


def _infer_preset_from_range(
    start: Optional[date], end: Optional[date], today: date
) -> Optional[str]:
    if not start or not end:
        return None
    month_start = date(today.year, today.month, 1)
    month_end = date(today.year, today.month, monthrange(today.year, today.month)[1])
    if start == month_start and end >= today and end <= month_end:
        return "mtd"
    if start == month_start and end == month_end:
        return "this_month"
    return None


def _nlq_from_filters(data: Dict[str, Any]) -> NLQuery:
    merchants = list(data.get("merchants") or [])
    categories = list(data.get("categories") or [])
    date_block = data.get("date") if isinstance(data.get("date"), dict) else {}
    start = _parse_date(data.get("start")) or _parse_date(date_block.get("start"))
    end = _parse_date(data.get("end")) or _parse_date(date_block.get("end"))
    min_amount = _parse_float(data.get("min_amount"))
    max_amount = _parse_float(data.get("max_amount"))
    intent = str(data.get("intent") or "list")
    limit = _parse_int(
        data.get("limit"), default=DEFAULT_LIMIT, minimum=1, maximum=1000
    )

    nlq = NLQuery(
        merchants=merchants,
        categories=categories,
        start=start,
        end=end,
        min_amount=min_amount,
        max_amount=max_amount,
        intent=intent,
        limit=limit,
    )

    flow = data.get("flow")
    if isinstance(flow, str) and flow in {"expenses", "income", "all"}:
        setattr(nlq, "flow", flow)

    page = data.get("page")
    if page is not None:
        setattr(nlq, "page", _parse_int(page, default=1, minimum=1))
    page_size = data.get("page_size")
    if page_size is not None:
        setattr(
            nlq,
            "page_size",
            _parse_int(page_size, default=limit, minimum=1, maximum=1000),
        )

    preset = date_block.get("preset") if isinstance(date_block, dict) else None
    if isinstance(preset, str) and preset:
        setattr(nlq, "date_preset", preset)

    return nlq


def _nlq_to_filters_dict(nlq: NLQuery) -> Dict[str, Any]:
    data: Dict[str, Any] = {
        "merchants": list(nlq.merchants),
        "categories": list(nlq.categories),
        "start": nlq.start.isoformat() if nlq.start else None,
        "end": nlq.end.isoformat() if nlq.end else None,
        "min_amount": nlq.min_amount,
        "max_amount": nlq.max_amount,
        "intent": nlq.intent,
        "limit": nlq.limit,
    }
    flow = getattr(nlq, "flow", None)
    if flow:
        data["flow"] = flow
    for attr in ("page", "page_size"):
        if hasattr(nlq, attr):
            data[attr] = getattr(nlq, attr)
    date_meta = {
        "preset": getattr(nlq, "date_preset", None),
        "start": data["start"],
        "end": data["end"],
    }
    if any(date_meta.values()):
        data["date"] = date_meta
    return {k: v for k, v in data.items() if v is not None}


def _result_total(payload: Dict[str, Any]) -> int:
    intent = payload.get("intent")
    result = payload.get("result")
    if intent == "list":
        return len(result or [])
    if intent in {"top_merchants", "top_categories", "by_day", "by_week", "by_month"}:
        return len(result or [])
    if intent == "count":
        try:
            return int((result or {}).get("count", 0))
        except (TypeError, ValueError):
            return 0
    if intent == "sum":
        try:
            return int(round(float((result or {}).get("total_abs", 0))))
        except (TypeError, ValueError):
            return 0
    return 0


@router.post("/nl", response_model=TxnNLResponse)
def transactions_nl(req: TxnNLRequest, db: Session = Depends(get_db)) -> TxnNLResponse:
    q = (req.query or "").strip()
    if not q and not req.filters:
        return TxnNLResponse(
            reply='Please type a search, e.g., "Starbucks this month", "Delta in Aug 2025", or "transactions > $50 last 90 days".',
            rephrased=False,
            meta={"reason": "empty"},
        )

    try:
        if req.filters:
            nlq = _nlq_from_filters(req.filters)
        else:
            nlq = parse_nl_query(q)
            preset = _infer_preset_from_query(q)
            if preset:
                setattr(nlq, "date_preset", preset)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    today = date.today()
    date_preset = getattr(nlq, "date_preset", None) or _infer_preset_from_range(
        nlq.start, nlq.end, today
    )
    if date_preset:
        setattr(nlq, "date_preset", date_preset)

    result_payload = run_txn_query(db, nlq)
    total = _result_total(result_payload)

    intent = result_payload.get("intent")
    filters_dict = _nlq_to_filters_dict(nlq)

    if intent == "list" and total == 0 and date_preset in {"this_month", "mtd"}:
        widened_start = today - timedelta(days=90)
        widened_nlq = replace(nlq, start=widened_start, end=today)
        for attr in ("flow", "page", "page_size"):
            if hasattr(nlq, attr):
                setattr(widened_nlq, attr, getattr(nlq, attr))
        setattr(widened_nlq, "date_preset", "last_90d")
        widened_result = run_txn_query(db, widened_nlq)
        widened_total = _result_total(widened_result)
        if widened_total > 0:
            suggestion_filters = _nlq_to_filters_dict(widened_nlq)
            return TxnNLResponse(
                reply="No matches **this month**. I found **{count}** in the **last 90 days**. Tap a suggestion to view them.".format(
                    count=widened_total
                ),
                rephrased=False,
                meta={
                    "total": 0,
                    "suggestions": [
                        {
                            "label": "View last 90 days",
                            "action": {
                                "type": "nl_search_filters",
                                "filters": suggestion_filters,
                            },
                        }
                    ],
                },
            )

    reply_text = "Query completed."
    if intent == "list":
        reply_text = (
            f"Found **{total}** matching transaction{'s' if total != 1 else ''}."
        )
    elif intent == "count":
        reply_text = (
            f"Counted **{total}** matching transaction{'s' if total != 1 else ''}."
        )
    elif intent == "sum":
        total_abs = float((result_payload.get("result") or {}).get("total_abs", 0))
        reply_text = f"Total spend: **${total_abs:,.2f}**."

    meta: Dict[str, Any] = {
        "total": total,
        "filters": filters_dict,
        "result": result_payload,
        "intent": intent,
    }
    if q:
        meta["query"] = q

    return TxnNLResponse(reply=reply_text, rephrased=False, meta=meta)
