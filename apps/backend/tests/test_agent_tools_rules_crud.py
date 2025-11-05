import pytest

pytestmark = pytest.mark.agent_tools


def test_rules_crud_flow(client):
    # create
    r = client.post(
        "/agent/tools/rules", json={"merchant": "Starbucks", "category": "Dining out"}
    ).json()
    assert r["id"] > 0 and r["category"] == "Dining out"

    # list
    lst = client.get("/agent/tools/rules").json()
    assert any(x["id"] == r["id"] for x in lst)

    # update
    u = client.put(f"/agent/tools/rules/{r['id']}", json={"category": "Coffee"}).json()
    assert u["category"] == "Coffee"

    # delete
    d = client.delete(f"/agent/tools/rules/{r['id']}").json()
    assert d["status"] == "ok"
