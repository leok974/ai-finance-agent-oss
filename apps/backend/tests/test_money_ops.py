import io
import textwrap
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def _ingest(csv_text: str):
    files = {"file": ("seed.csv", io.BytesIO(csv_text.encode("utf-8")), "text/csv")}
    r = client.post("/ingest", files=files)
    assert r.status_code in (200, 201), r.text


def test_splits_and_transfers_and_recurring():
    _ingest(
        textwrap.dedent(
            """\
        date,month,merchant,description,amount,category
        2025-08-02,2025-08,Checking->Savings,Transfer out,-200.00,
        2025-08-03,2025-08,Savings<-Checking,Transfer in,200.00,
        2025-08-04,2025-08,Costco,Groceries + household,-150.00,
        2025-07-15,2025-07,Spotify,Family,-15.99,Subscriptions
        2025-08-15,2025-08,Spotify,Family,-15.99,Subscriptions
        2025-09-15,2025-09,Spotify,Family,-15.99,Subscriptions
    """
        )
    )

    # find txn ids (use whatever you already expose; if not, we assume IDs 1..N in test db)
    # For demo, mark a transfer between id 1 (out) and id 2 (in):
    r = client.post("/txns/mark_transfer", json={"txn_out_id": 1, "txn_in_id": 2})
    assert r.status_code == 200, r.text
    link_id = r.json()["link_id"]

    # split costco (id 3) into groceries + household
    r = client.post(
        "/txns/3/split",
        json={
            "legs": [
                {"category": "Groceries", "amount": -110.00},
                {"category": "Shopping", "amount": -40.00, "note": "household"},
            ]
        },
    )
    assert r.status_code == 200

    # recurring scan
    r = client.post("/txns/recurring/scan", json={"month": None})
    assert r.status_code == 200
    r = client.get("/txns/recurring")
    assert r.status_code == 200
    items = r.json()
    assert any(
        i["merchant"] == "Spotify" and i["cadence"] in ("monthly", "unknown")
        for i in items
    )

    # cleanup transfer link
    r = client.delete(f"/txns/transfer/{link_id}")
    assert r.status_code == 200
