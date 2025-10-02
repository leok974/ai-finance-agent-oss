import pathlib
import re
import pytest

BAD = re.compile(r"splitlines\(\).*startswith\(", re.IGNORECASE)
ROOT = pathlib.Path(__file__).resolve().parents[2]  # repo root

@pytest.mark.skipif(False, reason="guideline active")
def test_no_brittle_metric_checks():
    offenders = []
    for p in ROOT.glob("apps/backend/tests/**/*.py"):
        if "helpers" in p.parts:
            continue
        try:
            s = p.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            continue
        if BAD.search(s):
            offenders.append(str(p))
    assert not offenders, f"Brittle metric parsing in: {offenders}"
