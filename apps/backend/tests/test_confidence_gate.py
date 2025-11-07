"""Test confidence gating for low-confidence suggestions."""


def test_low_confidence_triggers_ask(db_session, suggest_client, make_txn, monkeypatch):
    """Test that low confidence triggers 'ask agent' mode."""
    txn = make_txn(merchant="Unknown", amount=17.23)

    # Mock low-confidence candidate
    low_conf_candidates = [
        {
            "label": "X",
            "confidence": 0.42,
            "reasons": [{"source": "mock"}],
            "source": "model",
            "model_version": "test",
        }
    ]

    # Monkeypatch the candidate generation
    monkeypatch.setattr(
        "app.services.suggest.serve.get_candidates",
        lambda *args, **kwargs: low_conf_candidates,
    )

    resp = suggest_client.post("/ml/suggestions", json={"txn_id": txn.txn_id})

    assert resp.status_code == 200
    data = resp.json()

    assert data["mode"] == "ask"
    assert data["confidence"] <= 0.5
    assert "ask" in data["message"].lower()


def test_high_confidence_returns_suggestion(
    db_session, suggest_client, make_txn, monkeypatch
):
    """Test that high confidence returns normal suggestion."""
    txn = make_txn(merchant="KnownStore", amount=25.00)

    # Mock high-confidence candidate
    high_conf_candidates = [
        {
            "label": "Groceries",
            "confidence": 0.85,
            "reasons": [{"source": "model", "features": ["merchant"]}],
            "source": "model",
            "model_version": "v1.0",
        }
    ]

    monkeypatch.setattr(
        "app.services.suggest.serve.get_candidates",
        lambda *args, **kwargs: high_conf_candidates,
    )

    resp = suggest_client.post("/ml/suggestions", json={"txn_id": txn.txn_id})

    assert resp.status_code == 200
    data = resp.json()

    assert data.get("mode") != "ask"
    assert data["label"] == "Groceries"
    assert data["confidence"] >= 0.5


def test_no_candidates_triggers_ask(db_session, suggest_client, make_txn, monkeypatch):
    """Test that no candidates triggers 'ask agent' mode."""
    txn = make_txn(merchant="NewMerchant", amount=99.99)

    # Mock empty candidates
    monkeypatch.setattr(
        "app.services.suggest.serve.get_candidates",
        lambda *args, **kwargs: [],
    )

    resp = suggest_client.post("/ml/suggestions", json={"txn_id": txn.txn_id})

    assert resp.status_code == 200
    data = resp.json()

    assert data["mode"] == "ask"
    assert data["confidence"] == 0.0


def test_boundary_confidence_at_threshold(
    db_session, suggest_client, make_txn, monkeypatch
):
    """Test behavior at exactly the confidence threshold."""
    txn = make_txn(merchant="BorderlineStore", amount=30.00)

    # Mock candidate at exactly 0.50
    boundary_candidates = [
        {
            "label": "Shopping",
            "confidence": 0.50,
            "reasons": [{"source": "heuristic"}],
            "source": "rule",
            "model_version": "heuristic_v1",
        }
    ]

    monkeypatch.setattr(
        "app.services.suggest.serve.get_candidates",
        lambda *args, **kwargs: boundary_candidates,
    )

    resp = suggest_client.post("/ml/suggestions", json={"txn_id": txn.txn_id})

    assert resp.status_code == 200
    data = resp.json()

    # At exactly 0.50, should pass (>=0.50)
    assert data.get("mode") != "ask"
    assert data["confidence"] >= 0.50


def test_suggestion_logging_on_ask_mode(
    db_session, suggest_client, make_txn, monkeypatch
):
    """Test that 'ask' mode logs a suggestion record."""
    txn = make_txn(merchant="AskMerchant", amount=12.50)

    # Mock low-confidence
    monkeypatch.setattr(
        "app.services.suggest.serve.get_candidates",
        lambda *args, **kwargs: [
            {
                "label": "Y",
                "confidence": 0.35,
                "reasons": [],
                "source": "model",
                "model_version": "v1",
            }
        ],
    )

    resp = suggest_client.post("/ml/suggestions", json={"txn_id": txn.txn_id})

    assert resp.status_code == 200

    # Check that a suggestion was logged
    from app.db.models import Suggestion

    logged = db_session.query(Suggestion).filter_by(txn_id=txn.txn_id).first()
    assert logged is not None
    assert logged.label == "ASK_AGENT"
    assert logged.source == "ask"
