from __future__ import annotations

from io import BytesIO
from typing import Dict, Any

import pandas as pd

try:
    from reportlab.lib.pagesizes import LETTER
    from reportlab.pdfgen import canvas
    REPORTLAB_AVAILABLE = True
except Exception:  # pragma: no cover - during minimal envs
    REPORTLAB_AVAILABLE = False

from sqlalchemy.orm import Session

from .charts_data import get_month_summary, get_month_merchants


def build_excel_bytes(db: Session, month: str) -> bytes:
    """Build a simple Excel workbook with a Summary and Merchants sheet.
    Uses pandas with the XlsxWriter engine.
    """
    summary = get_month_summary(db, month)
    merchants = get_month_merchants(db, month)["merchants"]

    # Prepare DataFrames
    df_summary = pd.DataFrame([
        {
            "Month": summary["month"],
            "Total Spend": round(summary["total_spend"], 2),
            "Total Income": round(summary["total_income"], 2),
            "Net": round(summary["net"], 2),
        }
    ])
    df_categories = pd.DataFrame(summary["categories"])  # columns: name, amount
    df_merchants = pd.DataFrame(merchants)  # merchant, amount, n

    bio = BytesIO()
    with pd.ExcelWriter(bio, engine="xlsxwriter") as writer:
        df_summary.to_excel(writer, index=False, sheet_name="Summary")
        df_categories.to_excel(writer, index=False, sheet_name="Categories")
        df_merchants.to_excel(writer, index=False, sheet_name="Merchants")
    return bio.getvalue()


def build_pdf_bytes(db: Session, month: str) -> bytes:
    """Build a tiny PDF summary using reportlab; keep it minimal but useful."""
    if not REPORTLAB_AVAILABLE:
        raise RuntimeError("reportlab is not installed in this environment")

    summary = get_month_summary(db, month)
    merchants = get_month_merchants(db, month)["merchants"][:10]

    bio = BytesIO()
    c = canvas.Canvas(bio, pagesize=LETTER)
    width, height = LETTER

    y = height - 72  # 1in margin
    c.setFont("Helvetica-Bold", 16)
    c.drawString(72, y, f"Monthly Report: {summary['month']}")
    y -= 24

    c.setFont("Helvetica", 12)
    c.drawString(72, y, f"Total Spend: ${summary['total_spend']:.2f}")
    y -= 16
    c.drawString(72, y, f"Total Income: ${summary['total_income']:.2f}")
    y -= 16
    c.drawString(72, y, f"Net: ${summary['net']:.2f}")
    y -= 24

    c.setFont("Helvetica-Bold", 12)
    c.drawString(72, y, "Top Merchants")
    y -= 16

    c.setFont("Helvetica", 11)
    for m in merchants:
        line = f"- {m['merchant']}: ${m['amount']:.2f} ({m['n']} txns)"
        c.drawString(72, y, line)
        y -= 14
        if y < 72:
            c.showPage()
            y = height - 72
            c.setFont("Helvetica", 11)

    c.showPage()
    c.save()
    return bio.getvalue()
