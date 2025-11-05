import io
import csv
import re
from datetime import date
import pytest


def _make_csv(rows):
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(
        ["date", "merchant", "description", "amount"]
    )  # adjust if ingest schema changes
    w.writerows(rows)
    return buf.getvalue().encode()


@pytest.mark.integration
def test_unknown_to_categorized_removes_from_unknowns(client):
    """
    Ingest a single 'unknown' txn, verify it appears in /txns/unknowns,
    categorize it, then verify it no longer appears.
    """
    d = date(2025, 8, 12).isoformat()
    csv_bytes = _make_csv(
        [
            [d, "Test Coffee", "Latte", "-4.50"],
        ]
    )
    r = client.post(
        "/ingest?replace=true", files={"file": ("one.csv", csv_bytes, "text/csv")}
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("ok") is True

    month_match = re.match(r"(\d{4}-\d{2})-\d{2}", d)
    assert month_match, "Date format unexpected"
    month = month_match.group(1)

    r = client.get(f"/txns/unknowns?month={month}")
    assert r.status_code == 200, r.text
    unknowns = r.json().get("unknowns") or []
    assert len(unknowns) >= 1
    target = next(
        (
            u
            for u in unknowns
            if u.get("merchant") == "Test Coffee"
            and "Latte" in (u.get("description") or "")
        ),
        None,
    )
    assert target and target.get("id"), f"Unknown not found in list: {unknowns}"
    txn_id = target["id"]

    r = client.post(f"/txns/{txn_id}/categorize", json={"category": "Groceries"})
    assert r.status_code == 200, r.text

    r = client.get(f"/txns/unknowns?month={month}")
    assert r.status_code == 200, r.text
    unknowns_after = r.json().get("unknowns") or []
    assert all(
        u.get("id") != txn_id for u in unknowns_after
    ), f"Txn {txn_id} still present in unknowns"
