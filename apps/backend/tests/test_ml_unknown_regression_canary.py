import io
import os
import textwrap
from types import SimpleNamespace
import pytest

pytestmark = pytest.mark.skip(
    reason="Legacy /ml/* endpoints removed; use /agent/tools/*"
)
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def _seed_via_ingest_minimal():
    csv = textwrap.dedent(
        """\
        date,month,merchant,description,amount,category
        2025-08-15,2025-08,Costco,Groceries,-42.00,Groceries
        2025-08-15,2025-08,Starbucks,Latte,-5.25,Shopping
        """
    ).encode("utf-8")
    files = {"file": ("seed.csv", io.BytesIO(csv), "text/csv")}
    resp = client.post("/ingest", files=files)
    assert resp.status_code in (200, 201), resp.text


@pytest.mark.xfail(
    strict=True, reason="Canary: should FAIL if exclusion remains active after patch"
)
def test_canary_reinclude_unknown_via_monkeypatch(monkeypatch):
    # Run only when explicitly enabled to avoid CI noise
    if os.getenv("RUN_CANARY") not in ("1", "true", "True"):
        pytest.skip("Set RUN_CANARY=1 to execute the canary regression test")

    # Seed normal (non-Unknown) rows
    _seed_via_ingest_minimal()

    # Import module to patch
    import app.services.ml_train as ml_train_mod

    original_fetch = getattr(ml_train_mod, "_fetch_labeled_rows", None)
    if original_fetch is None:
        pytest.skip("ml_train._fetch_labeled_rows not found; cannot run canary")

    # Wrap original and APPEND a synthetic 'Unknown' row without touching ORM
    def patched_fetch(db):
        rows = list(original_fetch(db) or [])
        rows.append(
            SimpleNamespace(
                date="2025-08-15",
                month="2025-08",
                merchant="Mystery",
                description="TBD",
                amount=-9.99,
                category="Unknown",
            )
        )
        return rows

    monkeypatch.setattr(ml_train_mod, "_fetch_labeled_rows", patched_fetch)

    # Retrain (small/fast)
    r = client.post("/ml/train", json={"min_samples": 1, "test_size": 0.2})
    assert r.status_code == 200, r.text

    status = client.get("/ml/status").json()
    classes = status.get("classes") or []
    # With the patch, we EXPECT to see 'Unknown' present
    assert "Unknown" in classes, f"Canary expected 'Unknown' after patch; got {classes}"
