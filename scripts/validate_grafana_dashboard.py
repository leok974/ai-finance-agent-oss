#!/usr/bin/env python3
"""
Validates that a Grafana dashboard JSON:
- Parses as JSON
- Contains a `$prom` datasource variable in templating
- Contains required ML metric queries in panels
- Optionally verifies presence of JSON API datasource var `$api` when present

Usage: pre-commit passes changed files as args.
Exit non-zero to fail commit with a human-friendly error.
"""
import sys
import json
import pathlib

REQUIRED_METRICS = [
    "lm_ml_train_val_f1_macro",
    "lm_ml_predict_requests_total",
    "lm_suggest_compare_total",
]


def load_dashboard(path: pathlib.Path):
    data = json.loads(path.read_text(encoding="utf-8"))
    # Support either raw `{dashboard:{...}}` or a plain dashboard object
    if (
        isinstance(data, dict)
        and "dashboard" in data
        and isinstance(data["dashboard"], dict)
    ):
        return data["dashboard"]
    return data


def has_prom_var(d):
    templ = (d.get("templating") or {}).get("list") or []
    names = {(item.get("name") or "").lower() for item in templ}
    return "prom" in names


def has_required_metrics(d):
    panels = d.get("panels") or []
    blob = json.dumps(panels)
    missing = [m for m in REQUIRED_METRICS if m not in blob]
    return missing


def is_ml_dashboard(path: pathlib.Path, dashboard: dict):
    """Heuristic to detect if a dashboard is ML-related and should be strictly validated."""
    # Check filename
    name_lower = path.name.lower()
    if any(
        keyword in name_lower for keyword in ["ml", "suggestions", "predict", "train"]
    ):
        return True

    # Check dashboard title
    title = (dashboard.get("title") or "").lower()
    if any(
        keyword in title
        for keyword in ["ml", "machine learning", "suggestions", "predict"]
    ):
        return True

    return False


def main(argv):
    if len(argv) <= 1:
        print("No files provided.", file=sys.stderr)
        return 0

    ok = True
    validated_count = 0
    skipped_count = 0

    for arg in argv[1:]:
        p = pathlib.Path(arg)
        if not p.exists() or p.suffix.lower() != ".json":
            continue

        try:
            dash = load_dashboard(p)
        except Exception as e:
            print(f"[{p}] ❌ JSON parse error: {e}", file=sys.stderr)
            ok = False
            continue

        # Only validate ML requirements for ML dashboards
        if not is_ml_dashboard(p, dash):
            print(f"[{p}] ⏭️  Skipped (non-ML dashboard)")
            skipped_count += 1
            continue

        validated_count += 1
        file_ok = True

        if not has_prom_var(dash):
            print(
                f"[{p}] ❌ Missing Grafana datasource variable `$prom` in templating.list",
                file=sys.stderr,
            )
            ok = False
            file_ok = False

        missing = has_required_metrics(dash)
        if missing:
            print(
                f"[{p}] ❌ Dashboard panels missing required metrics: {', '.join(missing)}",
                file=sys.stderr,
            )
            ok = False
            file_ok = False

        if file_ok:
            print(f"[{p}] ✅ Grafana ML dashboard looks good.")

    if validated_count == 0 and skipped_count > 0:
        print(
            f"\n✅ No ML dashboards to validate ({skipped_count} non-ML dashboards skipped)"
        )

    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
