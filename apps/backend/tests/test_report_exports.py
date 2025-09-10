import datetime as dt
from sqlalchemy import delete

import pytest

from app.orm_models import Transaction


def _add_sample_month(db, yyyymm: str):
    # Ensure idempotency across tests sharing the same in-memory engine
    db.execute(delete(Transaction).where(Transaction.month == yyyymm))
    db.commit()
    y, m = map(int, yyyymm.split("-", 1))
    d1 = dt.date(y, m, 5)
    d2 = dt.date(y, m, 10)

    # Spend txn
    t1 = Transaction(
        date=d1,
        merchant="Local Store",
        description=f"Groceries {yyyymm}",
        amount=-50.25,
        category="Groceries",
        raw_category=None,
        account="Checking",
        month=yyyymm,
    )
    # Income txn (use category to trigger heuristic)
    t2 = Transaction(
        date=d2,
        merchant="Employer Inc",
        description=f"Paycheck {yyyymm}",
        amount=1000.00,
        category="Income",
        raw_category=None,
        account="Checking",
        month=yyyymm,
    )
    db.add_all([t1, t2])
    db.commit()


def test_report_excel_endpoint_returns_file(client, db_session):
    month = "2024-03"
    _add_sample_month(db_session, month)

    r = client.get(f"/report/excel?month={month}")
    assert r.status_code == 200
    # XLSX is a ZIP container; should start with PK\x03\x04
    assert r.headers.get("content-type") == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    body = r.content
    assert isinstance(body, (bytes, bytearray)) and len(body) > 100
    assert body[:2] == b"PK"


def test_report_pdf_endpoint_available_or_graceful(client, db_session):
    month = "2024-03"
    _add_sample_month(db_session, month)

    r = client.get(f"/report/pdf?month={month}")
    # If reportlab is installed, we should get a PDF. Else, a 503 with a clear error.
    if r.status_code == 200:
        assert r.headers.get("content-type") == "application/pdf"
        body = r.content
        assert isinstance(body, (bytes, bytearray)) and len(body) > 100
        # PDF header starts with %PDF
        assert body[:4] == b"%PDF"
    else:
        assert r.status_code == 503
        assert "reportlab" in (r.json().get("detail", "").lower())
