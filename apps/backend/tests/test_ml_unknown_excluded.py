import pytest
pytestmark = pytest.mark.skip(reason="Legacy /ml/* endpoints removed; use /agent/tools/*")
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


@pytest.mark.order(1)
def test_training_excludes_unknown_label():
    """
    After retraining, /ml/status.classes must not contain 'Unknown'.
    We keep parameters tiny so it runs fast in CI and with sparse data.
    """
    # Retrain the model (should use the SQLite test DB from conftest override)
    resp = client.post("/ml/train", json={"min_samples": 1, "test_size": 0.2})
    assert resp.status_code == 200, resp.text

    # Verify status
    status = client.get("/ml/status").json()
    classes = status.get("classes") or []

    # Even if there are too few labeled examples to populate many classes,
    # we must never include the 'Unknown' label in the trained model.
    assert "Unknown" not in classes, f"Unexpected 'Unknown' present in classes: {classes}"


@pytest.mark.order(2)
def test_suggest_never_returns_unknown_label():
    """
    Sanity check: suggestions should never surface 'Unknown' as a candidate.
    If there are no suggestions due to empty/sparse data, we pass the test.
    """
    # Ask for a tiny batch of suggestions (month omitted -> backend defaults to latest)
    resp = client.get("/ml/suggest?limit=10&topk=3")
    # Some setups may 404 if /ml/suggest is not wired yet — in that case, skip.
    if resp.status_code == 404:
        pytest.skip("/ml/suggest not implemented in this build")

    assert resp.status_code == 200, resp.text
    data = resp.json()

    # Expected shape: list of suggestion items, each with 'candidates' or similar
    if not data:
        pytest.skip("No suggestions returned; cannot validate candidate labels")

    # Normalize candidate extraction across possible shapes
    def candidate_labels(item):
        # Common shapes seen in earlier snapshots:
        # - item["candidates"] = [{"label": "...", "confidence": ...}, ...]
        # - item["topk"]       = [{"label": "...", "score": ...}, ...]
        cands = item.get("candidates") or item.get("topk") or []
        labels = []
        for c in cands:
            # Try typical keys; fall back to category if present
            label = c.get("label") or c.get("category")
            if label is not None:
                labels.append(label)
        return labels

    for item in data:
        labels = candidate_labels(item)
        # If the server returns a different shape with no labels, skip that item
        if not labels:
            continue
        assert all(l != "Unknown" for l in labels), f"Suggestion contains 'Unknown': {labels}"
