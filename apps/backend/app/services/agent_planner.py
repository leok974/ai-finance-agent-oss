from __future__ import annotations
import json, re
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, field_validator

from app.utils.env import is_dev
from app.utils import llm as llm_client
from app.utils.ratelimit import TokenBucket

# ---- allowed tools (whitelist) ----
ALLOWED_TOOLS: Dict[str, Dict[str, Any]] = {
    "charts.merchants": {"args": {"month": "YYYY-MM", "limit?": "int"}},
    "charts.summary":   {"args": {"month": "YYYY-MM"}},
    "report.pdf":       {"args": {"month": "YYYY-MM"}},
    "report.excel":     {"args": {"month": "YYYY-MM", "include_transactions?": "bool"}},
}


class PlanStep(BaseModel):
    tool: str
    args: Dict[str, Any]

    @field_validator("tool")
    @classmethod
    def validate_tool(cls, v: str):
        if v not in ALLOWED_TOOLS:
            raise ValueError(f"tool {v} not allowed")
        return v


class Plan(BaseModel):
    steps: List[PlanStep] = []


PROMPT = """You are a planner that turns a user's request into a short JSON plan of tool calls.
Allowed tools:
- charts.merchants(month=YYYY-MM, limit?)
- charts.summary(month=YYYY-MM)
- report.pdf(month=YYYY-MM)
- report.excel(month=YYYY-MM, include_transactions?)
Rules:
- Output ONLY JSON with shape: {"steps":[{"tool":"...", "args":{...}}, ...]}
- Prefer month YYYY-MM if the user gives a month like "July 2025" (=> 2025-07) or "July" (=> same year if obvious, else current year).
- Keep steps minimal and ordered.

User: {user_text}
JSON:
"""


def _strip_json_fences(s: str) -> str:
    return re.sub(r"^```(?:json)?|```$", "", s.strip(), flags=re.MULTILINE)


def _best_effort_json(s: str) -> Optional[dict]:
    s = _strip_json_fences(s)
    try:
        return json.loads(s)
    except Exception:
        m = re.search(r"\{[\s\S]*\}$", s)
        if m:
            try:
                return json.loads(m.group(0))
            except Exception:
                pass
    return None


def _month_from_text(user_text: str, default_year: int) -> Optional[str]:
    # naive month finder: "July 2025" or "July"
    months = {
        "january": "01",
        "february": "02",
        "march": "03",
        "april": "04",
        "may": "05",
        "june": "06",
        "july": "07",
        "august": "08",
        "september": "09",
        "october": "10",
        "november": "11",
        "december": "12",
    }
    lt = user_text.lower()
    for name, mm in months.items():
        if name in lt:
            y = re.search(r"(\d{4})", lt)
            year = int(y.group(1)) if y else default_year
            return f"{year}-{mm}"
    # explicit YYYY-MM
    yyyymm = re.search(r"(20\d{2})-(0[1-9]|1[0-2])", lt)
    if yyyymm:
        return yyyymm.group(0)
    return None


# module-wide planner throttle bucket (init on import)
try:
    _PLANNER_BUCKET  # type: ignore
except NameError:
    _PLANNER_BUCKET = TokenBucket(rate_per_minute=10)  # type: ignore


def get_planner_bucket_status() -> dict:
    b = _PLANNER_BUCKET  # type: ignore
    return {
        "rate_per_min": int(b.rate * 60),
        "capacity": int(b.capacity),
        "tokens": max(0.0, float(b.tokens)),
    }


def plan_tools(user_text: str, now_year: int, bypass_throttle: bool = False) -> Plan:
    """
    Try LLM plan; if it fails, fall back to a simple 2-step plan for
    'top merchants ... and generate a pdf' style prompts.
    """
    text = user_text.strip()
    MAX_STEPS = 3

    # Try LLM planner (best-effort; soft-fail)
    try:
        if bypass_throttle or _PLANNER_BUCKET.allow():  # type: ignore
            prompt = PROMPT.format(user_text=text)
            reply, _ = llm_client.call_local_llm(model="planner", messages=[{"role":"user","content": prompt}])
            data = _best_effort_json(reply or "")
            if data:
                try:
                    plan = Plan(**data)
                    if len(plan.steps) > MAX_STEPS:
                        plan.steps = plan.steps[:MAX_STEPS]
                    return plan
                except Exception:
                    pass
    except Exception:
        # ignore in fallback
        pass

    # Deterministic fallback (simple two-step for merchants+pdf)
    want_merchants = bool(re.search(r"top (merchant|merchants)", text, re.I))
    want_pdf = bool(re.search(r"\bpdf\b", text, re.I))
    want_excel = bool(re.search(r"\b(excel|xlsx|spreadsheet)\b", text, re.I))
    month = _month_from_text(text, now_year)
    if (want_merchants or want_pdf or want_excel) and month:
        steps: List[Dict[str, Any]] = []
        if want_merchants:
            steps.append({"tool": "charts.merchants", "args": {"month": month, "limit": 10}})
        if want_pdf:
            steps.append({"tool": "report.pdf", "args": {"month": month}})
        if want_excel:
            steps.append({"tool": "report.excel", "args": {"month": month}})
        if steps:
            steps = steps[:MAX_STEPS]
            return Plan(steps=[PlanStep(**s) for s in steps])

    # default: just try summary → pdf if pdf requested, else merchants
    if want_pdf and month:
        return Plan(steps=[PlanStep(tool="report.pdf", args={"month": month})])
    if want_excel and month:
        return Plan(steps=[PlanStep(tool="report.excel", args={"month": month})])
    if month:
        return Plan(steps=[PlanStep(tool="charts.merchants", args={"month": month, "limit": 10})])

    # nothing sensible
    return Plan(steps=[])
