import os
import sys
import importlib
import pytest


def test_agent_router_excluded_under_simulated_hermetic(
    monkeypatch: "pytest.MonkeyPatch",
):
    """Simulate a hermetic import (HERMETIC=1) and assert heavy /agent router excluded.

    Runs only in non-hermetic full test sessions; true hermetic runs intentionally skip
    all httpapi tests so we skip this test there to avoid duplication.
    """
    if os.getenv("HERMETIC") == "1":
        pytest.skip("Real hermetic run skips httpapi tests; simulation unnecessary")
    # Ensure clean import
    if "app.main" in sys.modules:
        del sys.modules["app.main"]
    monkeypatch.setenv("HERMETIC", "1")
    m = importlib.import_module("app.main")
    app = getattr(m, "app")
    # Agent chat route should not be present
    assert not any(
        getattr(r, "path", "").startswith("/agent/chat")
        for r in getattr(app, "routes", [])
    ), "agent chat route should be absent when HERMETIC=1"
    # Meta endpoint still present
    assert any(
        "/agent/tools/meta/latest_month" in getattr(r, "path", "")
        for r in getattr(app, "routes", [])
    ), "meta latest_month should be available"
