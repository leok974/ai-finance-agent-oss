from typing import List, Optional, Literal, Dict, Any
import logging
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import func, case
from sqlalchemy.orm import Session

from app.db import get_db
from app.transactions import Transaction
from app.services.insights_expanded import build_expanded_insights
from app.utils.auth import get_current_user
from app.agent.prompts import (
    INSIGHTS_EXPANDED_PROMPT,
    FINANCE_DEEP_DIVE_PROMPT,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/agent/tools/insights", tags=["agent-tools:insights"])

Severity = Literal["info", "warn", "critical"]
Kind = Literal[
    "summary",
    "unknown_spend",
    "top_categories",
    "top_merchants",
    "large_transaction",
]


class InsightsRequest(BaseModel):
    month: str = Field(..., description="YYYY-MM")
    top_n: int = Field(3, ge=1, le=10)
    # Consider any single transaction with abs(amount) >= large_txn_threshold as 'large'
    large_txn_threshold: float = Field(200.0, ge=0)
    include_unknown: bool = True


class InsightItem(BaseModel):
    id: str
    kind: Kind
    title: str
    detail: str
    severity: Severity = "info"
    metrics: Dict[str, Any] = Field(default_factory=dict)


class InsightsResponse(BaseModel):
    month: str
    insights: List[InsightItem]


def _unknown_cond():
    return (
        (Transaction.category.is_(None))
        | (func.trim(Transaction.category) == "")
        | (func.lower(Transaction.category) == "unknown")
    )


def _month_q(db: Session, month: str):
    return db.query(Transaction).filter(Transaction.month == month)


def _abs_outflow_sum():
    # Sum of negative amounts, returned as positive 'spend'
    return func.sum(
        func.abs(case((Transaction.amount < 0, Transaction.amount), else_=0.0))
    )


def _inflow_sum():
    return func.sum(case((Transaction.amount > 0, Transaction.amount), else_=0.0))


"""
Deprecated /summary route has been removed after migration to /expanded.
Frontends must call /agent/tools/insights/expanded instead.
"""


# --- Expanded insights (agent tools) -----------------------------------------
class ExpandedIn(BaseModel):
    month: Optional[str] = None
    large_limit: Optional[int] = 10
    status: Literal["all", "posted", "pending"] = "posted"
    view: Literal["insights", "deep_dive"] = "insights"


@router.post("/expanded")
def insights_expanded(
    body: ExpandedIn,
    user=Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    try:
        data = build_expanded_insights(
            db=db,
            month=body.month,
            status=body.status,
            large_limit=body.large_limit or 10,
        )

        # If service returns None/empty, provide safe fallback
        if not data or not data.get("month"):
            return {
                "month": body.month or "",
                "reply": "No data available for this month.",
                "summary": None,
                "mom": None,
                "unknown_spend": None,
                "top_categories": [],
                "top_merchants": [],
                "large_transactions": [],
                "anomalies": {"categories": [], "merchants": []},
            }

        # Compose a data-driven reply suitable for chat
        reply_lines = [
            f"Expanded insights for {data['month']}:",
            "",
        ]

        # Summary stats
        summary = data.get("summary") or {}
        spend = summary.get("spend", 0.0)
        income = summary.get("income", 0.0)
        net = summary.get("net", 0.0)

        reply_lines.append(f"- Spend: ${spend:.2f}")
        reply_lines.append(f"- Income: ${income:.2f}")
        reply_lines.append(f"- Net: ${net:.2f}")

        # MoM comparison if available
        mom = data.get("mom")
        if mom:
            spend_delta = mom.get("spend", {}).get("delta", 0.0)
            spend_pct = mom.get("spend", {}).get("pct")
            if spend_pct is not None:
                reply_lines.append(
                    f"- vs prev month: {spend_delta:+.2f} ({spend_pct*100:+.1f}%)"
                )

        # Unknown spend
        unknown = data.get("unknown_spend") or {}
        unknown_amount = unknown.get("amount", 0.0)
        unknown_count = unknown.get("count", 0)
        if unknown_amount > 0:
            reply_lines.append(
                f"- Unknown spend: ${unknown_amount:.2f} over {unknown_count} txn(s)"
            )

        # Top anomaly
        anomalies = data.get("anomalies") or {}
        cat_anomalies = anomalies.get("categories", [])
        merch_anomalies = anomalies.get("merchants", [])
        if cat_anomalies:
            top = cat_anomalies[0]
            reply_lines.append(
                f"- Biggest category increase: {top['key']} ${top['curr']:.2f} (was ${top['prev']:.2f})"
            )
        elif merch_anomalies:
            top = merch_anomalies[0]
            reply_lines.append(
                f"- Biggest merchant increase: {top['key']} ${top['curr']:.2f} (was ${top['prev']:.2f})"
            )

        # Top large transaction
        large = data.get("large_transactions", [])
        if large:
            top_txn = large[0]
            reply_lines.append(
                f"- Largest transaction: {top_txn.get('merchant', 'Unknown')} ${abs(top_txn.get('amount', 0)):.2f} on {top_txn.get('date', 'unknown date')}"
            )

        reply = "\n".join(reply_lines)

        # Choose prompt based on view parameter
        if body.view == "deep_dive":
            llm_prompt = FINANCE_DEEP_DIVE_PROMPT
        else:
            llm_prompt = INSIGHTS_EXPANDED_PROMPT

        return {
            "reply": reply,
            "month": data["month"],
            "summary": data.get("summary"),
            "mom": data.get("mom"),
            "unknown_spend": data.get("unknown_spend"),
            "top_categories": data.get("top_categories", []),
            "top_merchants": data.get("top_merchants", []),
            "large_transactions": data.get("large_transactions", []),
            "anomalies": data.get("anomalies", {"categories": [], "merchants": []}),
            "llm_prompt": llm_prompt,
        }
    except Exception:
        logger.exception("insights_expanded failed for month=%s", body.month)
        return {
            "month": body.month or "",
            "reply": f"Error loading insights for {body.month or 'this month'}.",
            "summary": None,
            "mom": None,
            "unknown_spend": None,
            "top_categories": [],
            "top_merchants": [],
            "large_transactions": [],
            "anomalies": {"categories": [], "merchants": []},
        }


# --- Minimal helper for /agent/chat resilience --------------------------------
# These are permissive shapes/utilities that allow the chat endpoint to
# normalize whatever "insights" payload exists, without crashing the request.


class ExpandedBody(BaseModel):
    summary: str = ""
    bullets: List[str] = []
    sources: List[str] = []


def expand(raw: Optional[dict[str, Any]] = None) -> ExpandedBody:
    if not raw:
        return ExpandedBody()

    summary = str(raw.get("summary") or raw.get("title") or raw.get("headline") or "")

    bullets = raw.get("bullets") or raw.get("items") or raw.get("points") or []
    if not isinstance(bullets, list):
        bullets = [str(bullets)]
    bullets = [str(x) for x in bullets]

    sources = raw.get("sources") or []
    if not isinstance(sources, list):
        sources = [str(sources)]
    sources = [str(x) for x in sources]

    return ExpandedBody(summary=summary, bullets=bullets, sources=sources)


__all__ = [
    # existing router symbols are exported via FastAPI router registration
    "ExpandedBody",
    "expand",
]
