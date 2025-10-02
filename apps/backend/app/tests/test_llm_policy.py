import os
from app.services.llm_flags import llm_policy


def test_force_tests_overrides(monkeypatch):
    monkeypatch.setenv("FORCE_LLM_TESTS", "1")
    monkeypatch.delenv("DEV_ALLOW_NO_LLM", raising=False)
    monkeypatch.delenv("LLM_ALLOW_IN_DEV", raising=False)
    pol = llm_policy("help")
    assert pol["allow"] is True
    assert pol["forced"] is True
    assert pol["globally_disabled"] is False


def test_dev_global_disable(monkeypatch):
    monkeypatch.delenv("FORCE_LLM_TESTS", raising=False)
    monkeypatch.setenv("DEV_ALLOW_NO_LLM", "1")
    monkeypatch.delenv("LLM_ALLOW_IN_DEV", raising=False)
    pol = llm_policy("explain")
    assert pol["allow"] is False
    assert pol["globally_disabled"] is True


def test_dev_allow_in_dev(monkeypatch):
    monkeypatch.delenv("FORCE_LLM_TESTS", raising=False)
    monkeypatch.delenv("DEV_ALLOW_NO_LLM", raising=False)
    monkeypatch.setenv("LLM_ALLOW_IN_DEV", "1")
    pol = llm_policy("chat")
    assert pol["allow"] is True
    assert pol["forced"] is False
