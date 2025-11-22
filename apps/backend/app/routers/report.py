from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from typing import Dict
from collections import defaultdict
from enum import Enum

from app.db import get_db
from app.deps.auth_guard import get_current_user_id
from app.services.charts_data import (
    latest_month_str,
    get_month_summary,
    get_month_merchants,
    get_month_categories,
    resolve_window,
    get_month_flows,
    get_spending_trends,
)
from app.services.report_export import (
    build_excel_bytes,
    build_pdf_bytes,
    ReportMode as ExportMode,
)
from app.transactions import Transaction

router = APIRouter()


class ReportMode(str, Enum):
    """Export mode for reports: full (summary + all txns), summary (summary only), unknowns (only uncategorized)"""

    full = "full"
    summary = "summary"
    unknowns = "unknowns"


@router.get("/report")
def report(month: str) -> Dict:
    from ..main import app

    cat_totals = defaultdict(float)
    for t in app.state.txns:
        if t["date"].startswith(month):
            cat_totals[t.get("category") or "Unknown"] += float(t["amount"])
    total = sum(cat_totals.values())
    rows = [
        {"category": c, "amount": round(v, 2)}
        for c, v in sorted(cat_totals.items(), key=lambda x: -x[1])
    ]
    return {"month": month, "total": round(total, 2), "by_category": rows}


@router.get("/report/excel")
def report_excel(
    user_id: int = Depends(get_current_user_id),
    month: str | None = Query(None, pattern=r"^\d{4}-\d{2}$"),
    start: str | None = Query(None, description="YYYY-MM-DD"),
    end: str | None = Query(None, description="YYYY-MM-DD"),
    mode: ReportMode = Query(
        ReportMode.full,
        description="Export mode: full (summary + all txns), summary (summary only), unknowns (uncategorized txns)",
    ),
    include_transactions: bool | None = Query(
        None, description="Deprecated: use mode parameter instead"
    ),
    split_transactions_alpha: bool = Query(False),
    db: Session = Depends(get_db),
):
    """Generate an Excel report for a month or custom date range.

    mode:
      - full: summary + all transactions (default)
      - summary: summary only, no transactions sheet
      - unknowns: only unknown/uncategorized transactions + summary
    """
    # Backwards compatibility: if include_transactions is explicitly set, map to mode
    if include_transactions is not None:
        mode = ReportMode.full if include_transactions else ReportMode.summary
    # Resolve an inclusive window for transactions; also pick a month hint for aggregations
    try:
        start_d, end_d = resolve_window(db, user_id, month, start, end)
    except ValueError:
        raise HTTPException(status_code=404, detail="No data available for reporting")
    month_hint = month or latest_month_str(db, user_id)
    if not month_hint:
        raise HTTPException(status_code=404, detail="No data available for reporting")

    # Assemble data parts (month-based aggregations)
    summary = get_month_summary(db, user_id, month_hint)
    summary["start"], summary["end"] = start_d.isoformat(), end_d.isoformat()
    merchants = get_month_merchants(db, user_id, month_hint)["merchants"]
    categories = get_month_categories(db, user_id, month_hint)
    flows = get_month_flows(db, user_id, month_hint)
    trends = get_spending_trends(db, user_id, months=6)

    # Fetch transactions as list of dicts for structured workbook
    transactions_list = []
    unknown_transactions_list = []
    include_transactions_flag = mode in (ReportMode.full, ReportMode.unknowns)
    only_unknowns = mode == ReportMode.unknowns

    if include_transactions_flag:
        query = db.query(
            Transaction.date,
            Transaction.merchant,
            Transaction.description,
            Transaction.category,
            Transaction.amount,
        ).filter(
            Transaction.user_id == user_id,
            Transaction.date >= start_d,
            Transaction.date <= end_d,
        )

        # Fetch all transactions for full mode or unknowns for unknowns mode
        if only_unknowns:
            query = query.filter(
                (Transaction.category.is_(None)) | (Transaction.category == "unknown")
            )

        rows = query.order_by(Transaction.date.asc()).all()

        # Convert to list of dicts
        for r in rows:
            txn_dict = {
                "date": (
                    r[0].isoformat() if getattr(r[0], "isoformat", None) else str(r[0])
                ),
                "merchant": r[1] or "",
                "description": r[2] or "",
                "amount": float(r[4] or 0.0),
                "category_label": r[3] or "Unknown",
                "category_slug": r[3] or "unknown",
            }
            transactions_list.append(txn_dict)

            # Track unknowns separately
            if not r[3] or r[3].lower() == "unknown":
                unknown_transactions_list.append(txn_dict)

    # Build Excel with structured sheets
    data = build_excel_bytes(
        summary=summary,
        merchants=merchants,
        categories=categories,
        flows=flows,
        trends=trends,
        mode=ExportMode(mode.value),  # Convert router enum to export enum
        transactions=transactions_list if mode == ReportMode.full else None,
        unknown_transactions=(
            unknown_transactions_list if mode == ReportMode.unknowns else None
        ),
        split_txns_alpha=split_transactions_alpha,
    )
    # Filename reflects month or custom range
    if month:
        filename = f"report-{month}.xlsx"
    else:
        filename = f"report-{summary['start']}_to_{summary['end']}.xlsx"
    headers = {"Content-Disposition": f"attachment; filename={filename}"}
    return StreamingResponse(
        iter([data]),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers=headers,
    )


@router.get("/report/pdf")
def report_pdf(
    month: str | None = Query(None, pattern=r"^\d{4}-\d{2}$"),
    start: str | None = Query(None, description="YYYY-MM-DD"),
    end: str | None = Query(None, description="YYYY-MM-DD"),
    mode: ReportMode = Query(
        ReportMode.summary,
        description="Export mode: full or summary (unknowns not supported for PDF)",
    ),
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Generate a PDF report for a month or custom date range; returns 503 if PDF engine missing.

    mode:
      - full: detailed summary (currently same as summary for PDF)
      - summary: summary view only (default)
      - unknowns: not supported for PDF (returns 400)
    """
    # Validate mode for PDF
    if mode == ReportMode.unknowns:
        raise HTTPException(
            status_code=400,
            detail="PDF export does not support 'unknowns' mode. Use Excel export for unknowns-only reports.",
        )
    try:
        start_d, end_d = resolve_window(db, user_id, month, start, end)
    except ValueError:
        raise HTTPException(status_code=404, detail="No data available for reporting")
    month_hint = month or latest_month_str(db, user_id)
    if not month_hint:
        raise HTTPException(status_code=404, detail="No data available for reporting")
    try:
        summary = get_month_summary(db, user_id, month_hint)
        summary["start"], summary["end"] = start_d.isoformat(), end_d.isoformat()
        merchants = get_month_merchants(db, user_id, month_hint)["merchants"]
        categories = get_month_categories(db, user_id, month_hint)
        data = build_pdf_bytes(summary, merchants, categories, None, None)
    except RuntimeError as e:
        # reportlab likely not installed in this environment
        raise HTTPException(status_code=503, detail=str(e))
    # Filename reflects month or custom range
    if month:
        filename = f"report-{month}.pdf"
    else:
        filename = f"report-{summary['start']}_to_{summary['end']}.pdf"
    headers = {"Content-Disposition": f"attachment; filename={filename}"}
    return StreamingResponse(
        iter([data]),
        media_type="application/pdf",
        headers=headers,
    )
