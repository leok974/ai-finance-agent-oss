from __future__ import annotations
from typing import Any, Dict

LOW_VALUE_SET = {"ok", "okay", "done", "noted"}

def post_process_tool_reply(out: Dict[str, Any], ctx: Any):
    # Skip if already marked not rephrased (deterministic/no-op) or empty
    if not out or out.get("rephrased") is False:
        return out
    txt = (out.get("reply") or "").strip().lower()
    if txt in LOW_VALUE_SET or (0 < len(txt) <= 3):
        # Derive tool/mode label and period
        tool = out.get("meta", {}).get("tool") or out.get("mode") or "this tool"
        period = getattr(ctx, "period_label", None)
        if not period and isinstance(ctx, dict):
            period = ctx.get("month")
        period = period or "this period"
        out = {
            "reply": f"I didn’t find enough data to run {tool} for {period}. Try Insights: Expanded or pick a different month.",
            "meta": {"reason": "low_value_msg", "tool": tool},
            "rephrased": False,
        }
    return out
