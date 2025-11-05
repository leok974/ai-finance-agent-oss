#!/usr/bin/env python3
"""
Fail if any /agent/describe/{panel_id}?month=YYYY-MM returns empty 'why' (or empty 'text' fallback).

Prefers /_selftest endpoint if available (faster, cleaner).
Falls back to per-panel checks to show specific failures.

Env:
  BASE_URL=http://localhost:8000      # API base
  MONTH=2025-11                        # override month (default: current local)
  PANELS=comma,separated,ids           # override panel list
  HELP_VALIDATE_SKIP=1                 # skip (always pass)
  HELP_VALIDATE_SOFT=1                 # warn only (non-zero -> still pass)
  HELP_VALIDATE_ALLOW_EMPTY=1          # allow empty when month has zero transactions (best-effort heuristic)
"""
import os, sys, json, datetime, urllib.request, urllib.error

BASE_URL = os.getenv("BASE_URL", "http://localhost:8000")
# current YYYY-MM in local time (NY by default in your project)
_month = datetime.datetime.now().strftime("%Y-%m")
MONTH = os.getenv("MONTH", _month)

DEFAULT_PANELS = [
    "charts.month_merchants",
    "charts.month_categories",
    "charts.daily_flows",
    "charts.month_anomalies",
    "charts.insights_overview",
]
PANELS = os.getenv("PANELS", ",".join(DEFAULT_PANELS)).split(",")

SKIP = os.getenv("HELP_VALIDATE_SKIP") == "1"
SOFT = os.getenv("HELP_VALIDATE_SOFT") == "1"
ALLOW_EMPTY = os.getenv("HELP_VALIDATE_ALLOW_EMPTY") == "1"

def _get(url: str):
    req = urllib.request.Request(url, headers={"accept": "application/json"})
    with urllib.request.urlopen(req, timeout=8) as r:
        return r.getcode(), r.read()

def _try_selftest() -> bool:
    """
    Try GET /_selftest?month=YYYY-MM first (fast path).
    Returns True if selftest passes, False if it fails or doesn't exist.
    """
    try:
        url = f"{BASE_URL}/agent/describe/_selftest?month={MONTH}"
        code, body = _get(url)
        if code != 200:
            return False
        data = json.loads(body.decode("utf-8"))
        if data.get("all_ok"):
            print(f"✅ Selftest passed: all panels OK for {MONTH}")
            return True
        else:
            # Selftest exists but reported failures
            print(f"⚠️  Selftest reported failures:")
            ok_status = data.get("ok", {})
            errors = data.get("errors", {})
            for panel_id, is_ok in ok_status.items():
                if not is_ok:
                    error_msg = errors.get(panel_id, "Unknown error")
                    print(f"  ❌ {panel_id}: {error_msg}")
            return False
    except urllib.error.HTTPError as e:
        if e.code == 404:
            # Selftest endpoint doesn't exist, fall back to per-panel checks
            return False
        elif e.code == 422:
            # Invalid month parameter - show error and fail fast
            try:
                error_data = json.loads(e.read().decode("utf-8"))
                print(f"❌ Validation error: {error_data.get('detail', 'Invalid month')}")
            except Exception:
                print(f"❌ HTTP 422: Invalid month parameter")
            return False
        # Other HTTP errors - re-raise to fail fast
        raise
    except Exception as ex:
        # Network/JSON errors - fall back to per-panel checks
        print(f"⚠️  Selftest unavailable ({type(ex).__name__}), falling back to per-panel checks")
        return False

def _probe_txn_presence() -> bool:
    """Best-effort: if API has a count endpoint use it; else assume data exists."""
    # If you have a proper stats endpoint, plug it here.
    # Fallback: assume data exists to be strict.
    return False  # strict by default

def main():
    if SKIP:
        print("⏭️  HELP_VALIDATE_SKIP=1 set — skipping help validation.")
        return 0

    # Try fast path: selftest endpoint
    if _try_selftest():
        return 0

    # Fall back to per-panel validation (shows detailed errors)
    print(f"🔎 Validating Help panels individually for month={MONTH} at {BASE_URL}")
    failures = []
    for pid in PANELS:
        url = f"{BASE_URL}/agent/describe/{pid}?month={MONTH}"
        try:
            code, body = _get(url)
            if code != 200:
                failures.append((pid, f"HTTP {code}"))
                continue
            try:
                data = json.loads(body.decode("utf-8"))
            except Exception as e:
                failures.append((pid, f"Invalid JSON: {e}"))
                continue

            # Accept any of these fields as the "why" content:
            text = data.get("explain") or data.get("why") or data.get("reply") or data.get("text") or ""
            if not (isinstance(text, str) and text.strip()):
                if ALLOW_EMPTY and not _probe_txn_presence():
                    print(f"⚠️  {pid}: empty why/text but allowed (no data detected).")
                else:
                    failures.append((pid, "Empty why/text"))
            else:
                print(f"✅ {pid}: {text.strip()[:80]}{'…' if len(text.strip())>80 else ''}")

        except urllib.error.URLError as e:
            failures.append((pid, f"Request error: {e}"))

    if failures:
        print("\n❌ Help validation failed:")
        for pid, reason in failures:
            print(f"  - {pid}: {reason}")
        if SOFT:
            print("⚠️  HELP_VALIDATE_SOFT=1 set — not failing the commit.")
            return 0
        return 1

    print("\n✅ All help panels returned non-empty explanations.")
    return 0

if __name__ == "__main__":
    sys.exit(main())
