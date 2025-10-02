import os, importlib


def test_hermetic_env_on():
    assert os.getenv("HERMETIC") == "1", "HERMETIC flag must be set for hermetic run"


def test_can_import_describe_logic():
    mod = importlib.import_module("app.logic.describe_logic")
    assert hasattr(mod, "build_contextual_summary")
    data = [{"a": 1, "b": 2}, {"a": 3, "c": 4}, {"d": 5}]
    summary = mod.build_contextual_summary(data)
    assert summary["total"] == 3
    assert set(summary["keys"]) == {"a", "b", "c", "d"}
    redacted = mod.redact_keys({"secret": 1, "ok": 2}, ["secret"])  # type: ignore
    assert redacted["secret"] == "[redacted]"
