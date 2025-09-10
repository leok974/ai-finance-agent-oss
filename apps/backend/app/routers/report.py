from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from typing import Dict
from collections import defaultdict

from app.db import get_db
from app.services.charts_data import latest_month_str
from app.services.report_export import build_excel_bytes, build_pdf_bytes

router = APIRouter()

@router.get("/report")
def report(month: str) -> Dict:
    from ..main import app
    cat_totals = defaultdict(float)
    for t in app.state.txns:
        if t["date"].startswith(month):
            cat_totals[t.get("category") or "Unknown"] += float(t["amount"])
    total = sum(cat_totals.values())
    rows = [{"category": c, "amount": round(v,2)} for c,v in sorted(cat_totals.items(), key=lambda x:-x[1])]
    return {"month": month, "total": round(total,2), "by_category": rows}


@router.get("/report/excel")
def report_excel(
    month: str | None = Query(None, pattern=r"^\d{4}-\d{2}$"),
    db: Session = Depends(get_db),
):
    """Generate an Excel report for a month; if month omitted, use latest DB month."""
    if not month:
        month = latest_month_str(db)
    if not month:
        raise HTTPException(status_code=404, detail="No data available for reporting")
    data = build_excel_bytes(db, month)
    filename = f"report-{month}.xlsx"
    headers = {"Content-Disposition": f"attachment; filename={filename}"}
    return StreamingResponse(
        iter([data]),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers=headers,
    )


@router.get("/report/pdf")
def report_pdf(
    month: str | None = Query(None, pattern=r"^\d{4}-\d{2}$"),
    db: Session = Depends(get_db),
):
    """Generate a PDF report for a month; if month omitted, use latest DB month."""
    if not month:
        month = latest_month_str(db)
    if not month:
        raise HTTPException(status_code=404, detail="No data available for reporting")
    try:
        data = build_pdf_bytes(db, month)
    except RuntimeError as e:
        # reportlab likely not installed in this environment
        raise HTTPException(status_code=503, detail=str(e))
    filename = f"report-{month}.pdf"
    headers = {"Content-Disposition": f"attachment; filename={filename}"}
    return StreamingResponse(
        iter([data]),
        media_type="application/pdf",
        headers=headers,
    )
