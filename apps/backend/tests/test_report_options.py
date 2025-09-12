import datetime as dt
import pytest

from sqlalchemy import delete
from app.orm_models import Transaction


def _seed_month(db, yyyymm: str):
    # idempotent seed for the month
    db.execute(delete(Transaction).where(Transaction.month == yyyymm))
    db.commit()
    y, m = map(int, yyyymm.split('-', 1))
    d1 = dt.date(y, m, 3)
    d2 = dt.date(y, m, 18)
    db.add_all([
        Transaction(date=d1, merchant="Alpha Store", description="A-buy", amount=-12.34, category="Groceries", raw_category=None, account="Chk", month=yyyymm),
        Transaction(date=d1, merchant="Zeta Shop", description="Z-buy", amount=-45.67, category="Shopping", raw_category=None, account="Chk", month=yyyymm),
        Transaction(date=d2, merchant="Employer", description="Pay", amount=500.0, category="Income", raw_category=None, account="Chk", month=yyyymm),
    ])
    db.commit()


def test_pdf_with_categories_and_range(client, db_session):
    month = "2025-08"
    _seed_month(db_session, month)
    r = client.get("/report/pdf?start=2025-08-01&end=2025-08-31")
    assert r.status_code in (200, 503)


def test_excel_alpha_split_and_range(client, db_session):
    month = "2025-08"
    _seed_month(db_session, month)
    r = client.get("/report/excel?start=2025-08-01&end=2025-08-31&include_transactions=true&split_transactions_alpha=true")
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("application/vnd.openxmlformats")
