def test_temp_budget_crud(client):
    r = client.post("/budgets/temp", json={"category": "Groceries", "amount": 500})
    assert r.status_code == 200 and r.json()["ok"] is True
    m = r.json()["temp_budget"]["month"]

    r2 = client.get(f"/budgets/temp?month={m}")
    items = r2.json()["items"]
    assert any(i["category"] == "Groceries" and i["amount"] == 500 for i in items)

    r3 = client.delete(f"/budgets/temp/Groceries?month={m}")
    assert r3.json()["deleted"]["category"] == "Groceries"
