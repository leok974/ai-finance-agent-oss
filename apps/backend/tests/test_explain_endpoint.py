import os
import re
import pytest
from datetime import date, datetime, timedelta
from app.utils.time import utc_now

from app.transactions import Transaction
from app.orm_models import Feedback, RuleORM as Rule


def _mk_txn(db, **kw):
    t = Transaction(
        date=kw.get("date", date.today()),
        merchant=kw.get("merchant", "Starbucks #123"),
        description=kw.get("description", "Latte"),
        amount=kw.get("amount", -4.50),
        category=kw.get("category", "Unknown"),
        account=kw.get("account", "CHK"),
    )
    db.add(t)
    db.commit()
    db.refresh(t)
    return t


def _mk_rule(db, pattern: str, target: str, category: str):
    r = Rule(pattern=pattern, target=target, category=category, active=True)
    db.add(r)
    db.commit()
    db.refresh(r)
    return r


def _mk_feedback(db, txn_id: int, label: str, source: str = "user_change"):
    fb = Feedback(txn_id=txn_id, label=label, source=source, created_at=utc_now())
    db.add(fb)
    db.commit()
    return fb


def test_404_when_missing(client):
    resp = client.get("/txns/999999/explain")
    assert resp.status_code == 404


def test_200_and_evidence_counts(client, db_session):
    # Seed txn and similar ones with feedback
    t0 = _mk_txn(db_session, merchant="Starbucks", description="coffee", amount=-5.25)
    # similar historical
    for i in range(3):
        ti = _mk_txn(db_session, merchant="Starbucks", description=f"drink {i}", amount=-3.0 - i, category="Dining out")
        _mk_feedback(db_session, ti.id, "Dining out")

    resp = client.get(f"/txns/{t0.id}/explain")
    assert resp.status_code == 200
    data = resp.json()
    assert data["txn"]["id"] == t0.id
    # evidence correctness
    ev = data["evidence"]
    assert ev["merchant_norm"]  # canonical present
    # top category should be Dining out with count >= 1
    by_cat = ev["similar"]["by_category"]
    assert len(by_cat) >= 1
    assert by_cat[0]["category"] == "Dining out"
    assert by_cat[0]["count"] >= 1


def test_deterministic_includes_canon_and_top(client, db_session):
    t0 = _mk_txn(db_session, merchant="Target Store", description="shoes", amount=-25.00)
    # history signals
    for i in range(2):
        _ = _mk_txn(db_session, merchant="Target", description=f"item {i}", amount=-10 - i, category="Shopping")

    resp = client.get(f"/txns/{t0.id}/explain")
    assert resp.status_code == 200
    body = resp.json()
    det = body["rationale"]
    # contains merchant canonical and top category label
    canon = body["evidence"]["merchant_norm"]
    assert canon.lower() in det.lower()
    assert "Shopping" in det
    assert body["mode"] == "deterministic"
    assert body.get("llm_rationale") in (None, "")


def test_dev_allow_no_llm_skips_llm(client, db_session, monkeypatch):
    monkeypatch.setenv("DEV_ALLOW_NO_LLM", "1")
    t0 = _mk_txn(db_session, merchant="Netflix", description="subscription", amount=-15.0)
    resp = client.get(f"/txns/{t0.id}/explain?use_llm=1")
    assert resp.status_code == 200
    body = resp.json()
    assert body["mode"] == "deterministic"
    assert body.get("llm_rationale") in (None, "")


def test_llm_mode_with_mock(client, db_session, monkeypatch):
    # Force LLM via policy precedence (FORCE_LLM_TESTS)
    monkeypatch.delenv("DEV_ALLOW_NO_LLM", raising=False)
    monkeypatch.setenv("FORCE_LLM_TESTS", "1")

    # Monkeypatch llm.call_local_llm to return a polished string containing target category
    class _DummyLLM:
        @staticmethod
        def call_local_llm(*, model, messages, temperature=0.2, top_p=0.9):
            text = "This looks like Shopping based on your history."
            return text, []

    import app.utils.llm as llm_mod
    monkeypatch.setattr(llm_mod, "call_local_llm", _DummyLLM.call_local_llm)

    t0 = _mk_txn(db_session, merchant="Target", description="toys", amount=-32.0)
    # history to steer to Shopping
    for i in range(2):
        _ = _mk_txn(db_session, merchant="Target", description=f"item {i}", amount=-10 - i, category="Shopping")

    resp = client.get(f"/txns/{t0.id}/explain?use_llm=1")
    assert resp.status_code == 200
    body = resp.json()
    assert body["mode"] == "llm"
    assert body.get("llm_rationale")
    assert "Shopping" in body["llm_rationale"]
    # cleanup force flag so later tests honoring DEV_ALLOW_NO_LLM behave correctly
    monkeypatch.delenv("FORCE_LLM_TESTS", raising=False)
