from __future__ import annotations
from typing import Any, Dict

LOW_VALUE_SET = {"ok", "okay", "done", "noted"}

def post_process_tool_reply(out: Dict[str, Any], ctx: Any):
    # Skip if empty
    if not out:
        return out
    # Never transform deterministic/tool-routed responses (they always include 'mode')
    if 'mode' in out:
        return out
    # Deterministic tool responses set mode + tool_trace and either rephrased is None or False
    if out.get("model") == "deterministic":
        return out
    # Also skip if already marked not rephrased
    if out.get("rephrased") is False:
        return out

    original_snapshot = dict(out)  # defensive: preserve all keys to reapply later
    try:
        print("post_process_tool_reply: initial keys=", sorted(original_snapshot.keys()))
    except Exception:
        pass
    txt = (out.get("reply") or "").strip().lower()
    if txt in LOW_VALUE_SET or (0 < len(txt) <= 3):
        tool = out.get("meta", {}).get("tool") or out.get("mode") or "this tool"
        period = getattr(ctx, "period_label", None)
        if not period and isinstance(ctx, dict):
            period = ctx.get("month")
        period = period or "this period"
        out["reply"] = (
            f"I didn’t find enough data to run {tool} for {period}. "
            f"Try Insights: Expanded or pick a different month."
        )
        meta = dict(out.get("meta") or {})
        meta.update({"reason": "low_value_msg", "tool": tool})
        out["meta"] = meta
        out["rephrased"] = False
        # Ensure critical routing metadata is retained
        if "mode" not in out and "mode" in original_snapshot:
            out["mode"] = original_snapshot["mode"]
        # Re-add any other missing top-level keys (like filters, result, tool_trace, etc.)
        for k, v in original_snapshot.items():
            if k not in out:
                out[k] = v
        try:
            print("post_process_tool_reply: low-value applied keys=", sorted(out.keys()))
        except Exception:
            pass
    return out
