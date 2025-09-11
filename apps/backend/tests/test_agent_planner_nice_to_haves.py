from app.services.agent_planner import plan_tools


def test_excel_keyword_creates_excel_step():
    p = plan_tools("Give me July top merchants and an Excel export", now_year=2025)
    tools = [s.tool for s in p.steps]
    assert "charts.merchants" in tools
    assert "report.excel" in tools
    assert p.steps[0].args["month"] == "2025-07"


def test_max_three_steps_guard():
    # Ask for everything; ensure clamp to <=3
    p = plan_tools("For July give me top merchants, summary, and both PDF and Excel", now_year=2025)
    assert len(p.steps) <= 3


def test_pdf_only_when_requested():
    p = plan_tools("Export excel for July", now_year=2025)
    assert [s.tool for s in p.steps] == ["report.excel"]
