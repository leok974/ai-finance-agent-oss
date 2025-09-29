from __future__ import annotations

from io import BytesIO

import pandas as pd

try:
    from reportlab.lib.pagesizes import LETTER
    # from reportlab.pdfgen import canvas  # unused
    from reportlab.lib import colors
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
    from reportlab.lib.styles import getSampleStyleSheet
    REPORTLAB_AVAILABLE = True
except Exception:  # pragma: no cover - during minimal envs
    REPORTLAB_AVAILABLE = False

# (Removed unused Session and charts_data helpers imports)


def build_excel_bytes(
    summary: dict,
    merchants: list[dict],
    categories: list[dict],
    flows: dict | None = None,
    trends: dict | list | None = None,
    txns_df: "pd.DataFrame | None" = None,
    split_txns_alpha: bool = False,
) -> bytes:
    """Build an Excel workbook with Summary, Categories, TopMerchants, and optional sheets."""
    df_summary = pd.DataFrame([{
        "Month": summary.get("month"),
        "Total Spend": round(float(summary.get("total_spend", 0.0)), 2),
        "Total Income": round(float(summary.get("total_income", 0.0)), 2),
        "Net": round(float(summary.get("net", 0.0)), 2),
    }])
    df_categories = pd.DataFrame(categories or [])
    df_merchants = pd.DataFrame(merchants or [])

    bio = BytesIO()
    with pd.ExcelWriter(bio, engine="xlsxwriter") as writer:
        df_summary.to_excel(writer, index=False, sheet_name="Summary")
        if not df_categories.empty:
            df_categories.to_excel(writer, index=False, sheet_name="Categories")
        if not df_merchants.empty:
            df_merchants.to_excel(writer, index=False, sheet_name="TopMerchants")
        if flows:
            pd.DataFrame([flows]).to_excel(writer, index=False, sheet_name="Flows")
        if trends:
            # trends could be list or dict
            tdf = pd.DataFrame(trends if isinstance(trends, list) else trends.get("trends", []))
            if not tdf.empty:
                tdf.to_excel(writer, index=False, sheet_name="Trends")
        if txns_df is not None:
            try:
                if not txns_df.empty:
                    if split_txns_alpha and "merchant" in txns_df.columns:
                        df = txns_df.copy()
                        first = df["merchant"].fillna("").str.strip().str.upper().str[0]
                        am = df[first.isin(list("ABCDEFGHIJKLM"))]
                        nz = df[first.isin(list("NOPQRSTUVWXYZ")) | (~first.str.match(r"[A-Z]"))]
                        if not am.empty:
                            am.to_excel(writer, index=False, sheet_name="Transactions A-M")
                        if not nz.empty:
                            nz.to_excel(writer, index=False, sheet_name="Transactions N-Z")
                    else:
                        txns_df.to_excel(writer, index=False, sheet_name="Transactions")
            except Exception:
                pass
    # wb = writer.book  # unused
    # money = wb.add_format({"num_format": "$#,##0.00"})  # unused
        for sheet in ("Summary", "Categories", "TopMerchants", "Flows", "Trends"):
            if sheet in writer.sheets:
                ws = writer.sheets[sheet]
                ws.set_column(0, 20, 18, cell_format=None)
    return bio.getvalue()


def build_pdf_bytes(summary: dict, merchants: list[dict], categories: list[dict] | None = None, flows=None, trends=None) -> bytes:
    if not REPORTLAB_AVAILABLE:
        raise RuntimeError("reportlab is not installed in this environment")

    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=LETTER, title="Monthly Finance Report")
    styles = getSampleStyleSheet()
    story = []

    title = f"Monthly Finance Report — {summary.get('month') or (summary.get('start') or '')}→{summary.get('end') or ''}"
    story.append(Paragraph(title, styles["Title"]))
    story.append(Spacer(1, 12))

    # Summary stats
    story.append(Paragraph(f"Total Spend: ${summary.get('total_spend', 0):.2f}", styles["Normal"]))
    story.append(Paragraph(f"Total Income: ${summary.get('total_income', 0):.2f}", styles["Normal"]))
    story.append(Paragraph(f"Net: ${summary.get('net', 0):.2f}", styles["Normal"]))
    story.append(Spacer(1, 12))

    # Merchants table
    if merchants:
        story.append(Paragraph("Top Merchants (by spend)", styles["Heading2"]))
        m_rows = [["Merchant", "Spend", "Txns"]] + [
            [m.get("merchant"), f"${m.get('amount', 0):.2f}", str(m.get("n", 0))] for m in merchants[:15]
        ]
        mt = Table(m_rows, hAlign="LEFT", colWidths=[280, 90, 60])
        mt.setStyle(TableStyle([
            ("BACKGROUND", (0,0), (-1,0), colors.HexColor("#F0F0F0")),
            ("GRID", (0,0), (-1,-1), 0.25, colors.grey),
            ("FONTNAME", (0,0), (-1,0), "Helvetica-Bold"),
        ]))
        story.append(mt)
        story.append(Spacer(1, 12))

    # Categories table
    if categories:
        story.append(Paragraph("Top Categories (by spend)", styles["Heading2"]))
        c_rows = [["Category", "Spend"]] + [[c.get("category") or c.get("name"), f"${c.get('spend', c.get('amount', 0)):.2f}"] for c in categories[:15]]
        ct = Table(c_rows, hAlign="LEFT", colWidths=[280, 90])
        ct.setStyle(TableStyle([
            ("BACKGROUND", (0,0), (-1,0), colors.HexColor("#F0F0F0")),
            ("GRID", (0,0), (-1,-1), 0.25, colors.grey),
            ("FONTNAME", (0,0), (-1,0), "Helvetica-Bold"),
        ]))
        story.append(ct)
        story.append(Spacer(1, 12))

    doc.build(story)
    return buf.getvalue()
