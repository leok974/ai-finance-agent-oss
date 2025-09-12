def test_rule_suggestion_ignores_crud(client, db_session):
    # empty to start
    r0 = client.get("/rules/suggestions/ignores").json()
    assert r0["ignores"] == []

    # add
    r1 = client.post("/rules/suggestions/ignores", json={"merchant":"Starbucks","category":"Dining out"}).json()
    assert {"merchant":"Starbucks","category":"Dining out"} in r1["ignores"]

    # cached read
    r2 = client.get("/rules/suggestions/ignores?cached=true").json()
    assert any(i["merchant"]=="Starbucks" and i["category"]=="Dining out" for i in r2["ignores"])

    # delete
    r3 = client.delete("/rules/suggestions/ignores/Starbucks/Dining%20out").json()
    assert all(not (i["merchant"]=="Starbucks" and i["category"]=="Dining out") for i in r3["ignores"])
