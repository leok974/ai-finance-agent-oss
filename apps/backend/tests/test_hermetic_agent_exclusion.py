import os
import sys
import importlib
import pytest

# NOTE:
# This file enforces a true hermetic import path. It should ONLY run when the
# overall test session itself is hermetic (HERMETIC=1 set externally). When we
# execute the full non‑hermetic suite we do not want this module import side‑effect
# to flip the entire session into hermetic mode (which causes every httpapi test
# to skip). Therefore we guard collection: if HERMETIC is not already set to '1'
# we skip the entire module immediately without mutating the environment.
if os.getenv("HERMETIC") != "1":  # pragma: no cover - collection guard
    pytest.skip(
        "Skipping true hermetic exclusion test outside hermetic runs",
        allow_module_level=True,
    )


def test_agent_router_not_included_when_hermetic(monkeypatch: "pytest.MonkeyPatch"):
    """In hermetic mode (HERMETIC=1) the heavy /agent router should be skipped.

    This protects the lightweight environment from pulling LLM / enrichment dependencies
    and ensures earlier import guards remain effective.
    """
    # Already set at module import; reinforce for safety
    monkeypatch.setenv("HERMETIC", "1")
    # Force a clean import of app.main so conditional logic re-evaluates
    if "app.main" in sys.modules:
        del sys.modules["app.main"]
    m = importlib.import_module("app.main")
    app = getattr(m, "app")
    # Assert that no route starting with /agent/chat exists (or skip if app layout differs)
    agent_chat = [
        r
        for r in getattr(app, "routes", [])
        if getattr(r, "path", "").startswith("/agent/chat")
    ]
    if agent_chat:
        pytest.fail("agent chat route should be absent in hermetic mode")
    # But meta endpoints (which are still allowed) should remain available
    meta_present = any(
        "/agent/tools/meta/latest_month" in getattr(r, "path", "")
        for r in getattr(app, "routes", [])
    )
    # If meta router is intentionally disabled in hermetic future changes, this assertion can be relaxed.
    assert meta_present, "meta latest_month should still be available"
