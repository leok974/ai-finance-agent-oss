from __future__ import annotations
from typing import Any, Dict, List, Tuple
from sqlalchemy.orm import Session

from app.services.agent_planner import Plan
from app.services.charts_data import get_month_merchants, get_month_summary


def execute_plan(db: Session, plan: Plan, api_base: str = "") -> Tuple[List[Dict[str, Any]], Dict[str, Any], str]:
    """
    Returns (steps_results, artifacts, one_line_reply)
    artifacts may include 'pdf_url', 'excel_url', 'merchants', 'summary'
    """
    artifacts: Dict[str, Any] = {}
    steps_results: List[Dict[str, Any]] = []
    summary_bits: List[str] = []

    for step in plan.steps:
        if step.tool == "charts.merchants":
            month = step.args["month"]
            limit = int(step.args.get("limit", 10))
            data = get_month_merchants(db, month=month, limit=limit)
            rows = data.get("merchants", []) if isinstance(data, dict) else data
            steps_results.append({"tool": step.tool, "ok": True, "count": len(rows)})
            artifacts["merchants"] = rows
            if rows:
                top = rows[0]
                amt = float(top.get("amount") or top.get("spend") or 0.0)
                summary_bits.append(f"Top merchant for {month}: {top.get('merchant','?')} (${round(amt, 2)})")
        elif step.tool == "charts.summary":
            month = step.args["month"]
            ms = get_month_summary(db, month=month)
            steps_results.append({"tool": step.tool, "ok": True})
            if ms:
                artifacts["summary"] = ms
                net = float(ms.get("net") or 0.0)
                summary_bits.append(f"{month} net: ${round(net, 2)}")
        elif step.tool == "report.pdf":
            month = step.args["month"]
            url = f"/report/pdf?month={month}"
            steps_results.append({"tool": step.tool, "ok": True})
            artifacts["pdf_url"] = url
            summary_bits.append("PDF ready")
        elif step.tool == "report.excel":
            month = step.args["month"]
            include_tx = bool(step.args.get("include_transactions", False))
            url = f"/report/excel?month={month}" + ("&include_transactions=true" if include_tx else "")
            steps_results.append({"tool": step.tool, "ok": True})
            artifacts["excel_url"] = url
            summary_bits.append("Excel ready")
        else:
            steps_results.append({"tool": step.tool, "ok": False, "error": "unsupported"})

    one_line = " • ".join(summary_bits) if summary_bits else "Done."
    return steps_results, artifacts, one_line
