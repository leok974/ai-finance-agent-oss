def test_rules_save_normalizes_patterns_and_names_no_500(client):
    # Try to exercise any slug/name normalization or pattern canonicalization (implementation-specific)
    payload = {
        "rules": [
            {
                "id": "norm1",
                "name": "  Coffee  ",
                "pattern": " COFFEE | espresso ",
                "category": "restaurants",
                "enabled": True,
            },
            {
                "id": "norm2",
                "name": "Transport-Uber",
                "pattern": " Uber  |  LYFT ",
                "category": "transport",
                "enabled": True,
            },
        ]
    }
    r = client.post("/agent/tools/rules/save", json=payload)
    assert (
        r.status_code < 500
    ), f"unexpected 5xx: {r.status_code}\n{r.text}"  # Schema/body may vary; we only guard stability.
