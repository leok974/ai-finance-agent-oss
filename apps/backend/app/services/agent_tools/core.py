from typing import Dict, Any, Optional, List
import re
from sqlalchemy.orm import Session

from app.services.txns_nl_query import run_txn_query
from app.services.agent_detect import detect_txn_query, detect_analytics_intent
from app.services.charts_data import (
	latest_month_str,
	get_month_summary,
	get_month_flows,
	get_month_merchants,
	get_month_categories,
)
from app.services.budget_recommend import compute_recommendations
from app.services.agent_detect import detect_budget_recommendation, extract_months_or_default, Detector
from app.utils.state import TEMP_BUDGETS, ANOMALY_IGNORES, current_month_key
from app.services.charts_data import get_category_timeseries
from app.services.insights_anomalies import compute_anomalies
from .common import no_data_msg, no_data_kpis, no_data_anomalies, reply

# Lazy analytics loader to avoid importing heavy optional deps (pandas, statsmodels)
# during hermetic test startup. We import only when an analytics intent is actually
# routed. If import fails, we provide a lightweight fallback that returns empty /
# unavailable responses allowing tests to proceed without those packages.
def _get_analytics():  # type: ignore
	try:  # Local import so that simply importing this module stays light.
		from app.services import analytics as _analytics  # noqa
		return _analytics
	except Exception:  # pragma: no cover - fallback path only in hermetic envs
		class _Fallback:
			def compute_kpis(self, *a, **k):
				return {"months": [], "series": {}, "kpis": {}, "ok": False, "reason": "analytics_unavailable"}
			def forecast_cashflow(self, *a, **k):
				return {"ok": False, "reason": "analytics_unavailable", "forecast": [], "months": [], "series": {}}
			def find_anomalies(self, *a, **k):
				return {"month": None, "items": []}
			def detect_recurring(self, *a, **k):
				return {"items": []}
			def find_subscriptions(self, *a, **k):
				return {"items": []}
			def budget_suggest(self, *a, **k):
				return {"items": []}
			def whatif_sim(self, *a, **k):
				return {"ok": False, "reason": "analytics_unavailable"}
		return _Fallback()


def _human_period_label(month: Optional[str], lookback: Optional[int]) -> str:
	if month:
		return month
	if lookback:
		if lookback == 1:
			return "this month"
		return f"the last {lookback} months"
	return "this period"


def _no_data_response(
	mode: str,
	filters: Dict[str, Any],
	data: Dict[str, Any],
	*,
	month: Optional[str] = None,
	lookback: Optional[int] = None,
	tool_label: str,
	tips: Optional[List[str]] = None,
) -> Dict[str, Any]:
	label = _human_period_label(month, lookback)
	base = no_data_msg(label, tool=tool_label, tips=tips)
	meta = {**base.get("meta", {})}
	suggestions = meta.get("suggestions")
	if isinstance(suggestions, list):
		meta["suggestions"] = suggestions
	return {
		"mode": mode,
		"filters": filters,
		"result": data,
		"message": base["reply"],
		"reply": base["reply"],
		"rephrased": base.get("rephrased", False),
		"meta": meta,
	}


def _extract_month(text: str) -> Optional[str]:
	# Support 'in <Month> [Year]' or 'for <Month> [Year]'
	m = re.search(r"(?:in|for)\s+([A-Za-z]+)\s*(\d{4})?", text, re.IGNORECASE)
	if not m:
		return None
	try:
		from datetime import datetime
		month_name = m.group(1).title()
		year = int(m.group(2)) if m.group(2) else datetime.now().year
		month_num = datetime.strptime(month_name, "%B").month
		return f"{year:04d}-{month_num:02d}"
	except Exception:
		return None


def route_to_tool(user_text: str, db: Session) -> Optional[Dict[str, Any]]:
	text_low = user_text.lower()
	det = Detector()

	if det.detect_anomaly_ignore(user_text):
		ap = det.extract_anomaly_ignore_params(user_text)
		cat = ap.get("category")
		if cat:
			ANOMALY_IGNORES.add(cat)
			return {
				"mode": "insights.anomalies.ignore",
				"filters": {"category": cat},
				"result": {"ignored": sorted(list(ANOMALY_IGNORES))},
				"message": f"Ignoring anomalies for {cat}",
			}

	if det.detect_anomalies(user_text):
		p = det.extract_anomaly_params(user_text)
		result = compute_anomalies(
			db,
			months=p["months"],
			min_spend_current=p["min"],
			threshold_pct=p["threshold"],
			max_results=p["max"],
		)
		return {
			"mode": "insights.anomalies",
			"filters": {
				"months": p["months"],
				"min": p["min"],
				"threshold": p["threshold"],
				"max": p["max"],
			},
			"result": result,
			"message": None,
		}

	if det.detect_open_category_chart(user_text):
		cp = det.extract_chart_params(user_text)
		cat = cp.get("category")
		months = int(cp.get("months") or 6)
		if cat:
			series = get_category_timeseries(db, cat, months=months)
			return {
				"mode": "charts.category",
				"filters": {"category": cat, "months": months},
				"result": {"category": cat, "months": months, "series": series or []},
			}

	if det.detect_temp_budget(user_text):
		bp = det.extract_temp_budget_params(user_text)
		cat = bp.get("category")
		amt = bp.get("amount")
		if cat and (amt is not None):
			month_key = latest_month_str(db) or current_month_key()
			TEMP_BUDGETS[(month_key, cat)] = float(amt)
			return {
				"mode": "budgets.temp",
				"filters": {"month": month_key, "category": cat},
				"result": {"month": month_key, "category": cat, "amount": float(amt)},
				"message": f"Temporary budget set for {cat} @ {amt} in {month_key}",
			}

	hit = detect_analytics_intent(user_text)
	if hit:
		mode, args = hit
		month = latest_month_str(db) or current_month_key()
		analytics_svc = _get_analytics()
		if mode == "analytics.kpis":
			lookback = int(args.get("lookback_months") or 6)
			lookback = max(1, min(24, lookback))
			# Allow explicit month override if user specified one (including future)
			user_month = _extract_month(user_text)
			if user_month:
				month = user_month
			data = analytics_svc.compute_kpis(db, month=month, lookback=lookback)
			filters = {"month": month, "lookback_months": lookback}
			if not data.get("months"):
				return no_data_kpis(month)
			return reply(
				"Here are your KPIs.",
				mode="analytics.kpis",
				result=data,
				filters=filters,
			)
		if mode == "analytics.forecast":
			horizon = int(args.get("horizon") or 3)
			horizon = max(1, min(12, horizon))
			data = analytics_svc.forecast_cashflow(db, month=month, horizon=horizon)
			filters = {"month": month, "horizon": horizon}
			if not data.get("ok", True) or not data.get("forecast"):
				return _no_data_response(mode, filters, data, month=month, tool_label="Forecast", tips=["Use Insights: Expanded (last 60 days)", "Pick a month with ≥3 months of history"]) 
			return {"mode": mode, "filters": filters, "result": data}
		if mode == "analytics.anomalies":
			lookback = int(args.get("lookback_months") or 6)
			lookback = max(1, min(24, lookback))
			user_month = _extract_month(user_text)
			if user_month:
				month = user_month
			data = analytics_svc.find_anomalies(db, month=month, lookback=lookback)
			filters = {"month": month, "lookback_months": lookback}
			items = data.get("items") or []
			if not items:
				return no_data_anomalies(month)
			return reply(
				f"Found **{len(items)}** anomalies for {month}.",
				mode="insights.anomalies",
				result=data,
				filters=filters,
			)
		if mode == "analytics.recurring":
			lookback = int(args.get("lookback_months") or 6)
			lookback = max(1, min(24, lookback))
			data = analytics_svc.detect_recurring(db, month=month, lookback=lookback)
			filters = {"month": month, "lookback_months": lookback}
			if not (data.get("items") or []):
				return _no_data_response(mode, filters, data, month=month, lookback=lookback, tool_label="KPIs")
			return {"mode": mode, "filters": filters, "result": data}
		if mode == "analytics.subscriptions":
			lookback = int(args.get("lookback_months") or 6)
			lookback = max(1, min(24, lookback))
			data = analytics_svc.find_subscriptions(db, month=month, lookback=lookback)
			filters = {"month": month, "lookback_months": lookback}
			if not (data.get("items") or []):
				return _no_data_response(mode, filters, data, month=month, lookback=lookback, tool_label="KPIs")
			return {"mode": mode, "filters": filters, "result": data}
		if mode == "analytics.budget_suggest":
			lookback = int(args.get("lookback_months") or 6)
			lookback = max(1, min(24, lookback))
			data = analytics_svc.budget_suggest(db, month=month, lookback=lookback)
			filters = {"month": month, "lookback_months": lookback}
			if not (data.get("items") or []):
				return _no_data_response(mode, filters, data, month=month, lookback=lookback, tool_label="KPIs")
			return {"mode": mode, "filters": filters, "result": data}
		if mode == "analytics.whatif":
			payload = dict(args)
			if "month" not in payload:
				payload["month"] = month
			data = analytics_svc.whatif_sim(db, payload)
			return {"mode": mode, "filters": {"month": payload.get("month")}, "args": args, "result": data}

	is_txn, nlq = detect_txn_query(user_text)
	if is_txn and nlq is not None:
		res = run_txn_query(db, nlq)
		return {"mode": "nl_txns", "filters": res.get("filters"), "result": res}

	charts_kind: Optional[str] = None
	if any(k in text_low for k in ["trend", "spending trend", "series", "by day", "by week", "by month", "time series", "flows", "cash flow", "net flow", "inflow", "outflow"]):
		charts_kind = "flows"
	elif any(k in text_low for k in ["top merchants", "merchants breakdown", "merchant spend"]):
		charts_kind = "merchants"
	elif any(k in text_low for k in ["categories", "category breakdown", "by category"]):
		charts_kind = "categories"
	elif any(k in text_low for k in ["summary", "overview", "snapshot"]):
		charts_kind = "summary"

	if charts_kind:
		month = _extract_month(user_text) or latest_month_str(db)
		if not month:
			return None
		if charts_kind == "summary":
			data = get_month_summary(db, month)
			return {"mode": "charts.summary", "filters": {"month": month}, "result": data}
		if charts_kind == "flows":
			data = get_month_flows(db, month)
			return {"mode": "charts.flows", "filters": {"month": month}, "result": data}
		if charts_kind == "merchants":
			data = get_month_merchants(db, month)
			return {"mode": "charts.merchants", "filters": {"month": month}, "result": data.get("merchants", [])}
		if charts_kind == "categories":
			data = get_month_categories(db, month)
			return {"mode": "charts.categories", "filters": {"month": month}, "result": data}

	if any(k in text_low for k in ["export", "download", "report", "excel", "xlsx", "pdf"]):
		month = _extract_month(user_text) or latest_month_str(db)
		qs = []
		if month:
			qs.append(f"month={month}")
		include_tx = ("include transaction" in text_low) or ("with transactions" in text_low)
		kind = "excel" if ("excel" in text_low or "xlsx" in text_low) else ("pdf" if "pdf" in text_low else "excel")
		if kind == "excel":
			if include_tx:
				qs.append("include_transactions=true")
			url = "/report/excel" + ("?" + "&".join(qs) if qs else "")
			return {"mode": "report.link", "filters": {"month": month}, "url": url, "meta": {"kind": "excel"}}
		else:
			url = "/report/pdf" + ("?" + "&".join(qs) if qs else "")
			return {"mode": "report.link", "filters": {"month": month}, "url": url, "meta": {"kind": "pdf"}}

	if detect_budget_recommendation(user_text):
		months = extract_months_or_default(user_text, default=6)
		recs = compute_recommendations(db, months=months)
		return {
			"mode": "budgets.recommendations",
			"filters": {"months": months},
			"result": {"months": months, "recommendations": recs},
			"message": None,
		}

	if any(k in text_low for k in ["budget", "over budget", "under budget", "remaining budget"]):
		return {
			"mode": "budgets.read",
			"filters": {},
			"result": None,
			"message": "Budget queries are not implemented yet. Try: 'Top categories this month' or 'Export Excel for last month'.",
		}

	return None

__all__ = ["route_to_tool"]
