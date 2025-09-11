from datetime import date
from app.services.agent_planner import plan_tools
from app.services.agent_chain import execute_plan
from app.transactions import Transaction


def _seed_month(db, month: str = '2025-07'):
    # Create a few sample transactions
    items = [
    Transaction(date=date(2025, 7, 5), merchant='Starbucks', merchant_canonical='starbucks', amount=-12.34, category='Coffee', month=month),
    Transaction(date=date(2025, 7, 6), merchant='Amazon', merchant_canonical='amazon', amount=-45.00, category='Shopping', month=month),
    Transaction(date=date(2025, 7, 7), merchant='Payroll', merchant_canonical='payroll', amount=2000.00, category='Income', month=month),
    ]
    for it in items:
        db.add(it)
    db.commit()


def test_plan_fallback_merchants_pdf():
    p = plan_tools("Give me my top merchants for July and generate a PDF", now_year=2025)
    assert [s.tool for s in p.steps] == ["charts.merchants", "report.pdf"]
    assert p.steps[0].args["month"] == "2025-07"


def test_execute_chain_merchants_pdf(db_session):
    _seed_month(db_session, '2025-07')
    p = plan_tools("top merchants for July and PDF", now_year=2025)
    steps, artifacts, line = execute_plan(db_session, p)
    assert any(s["tool"] == "charts.merchants" for s in steps)
    assert "pdf_url" in artifacts
    assert artifacts["pdf_url"].startswith("/report/pdf")
    assert "PDF" in line
