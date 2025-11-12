"""Test admin guard for category rules endpoints."""


from app.orm_models import CategoryRule


def test_rules_list_requires_admin(client, user_override):
    """Test that listing rules requires admin role."""
    # Non-admin should get 403 (authenticated but not authorized)
    user_override.use(is_admin=False)
    r = client.get("/agent/tools/categorize/rules")
    assert r.status_code == 403, f"Expected 403 for non-admin, got {r.status_code}"
    assert "admin" in r.json().get("detail", "").lower()

    # Admin should get 200
    user_override.use(is_admin=True)
    r = client.get("/agent/tools/categorize/rules")
    assert r.status_code == 200, f"Expected 200 for admin, got {r.status_code}"
    assert isinstance(r.json(), list)


def test_rules_update_requires_admin(client, user_override, db_session):
    """Test that updating rules requires admin role."""
    # Create a test rule
    rule = CategoryRule(
        pattern="TEST_PATTERN", category_slug="test", priority=100, enabled=True
    )
    db_session.add(rule)
    db_session.commit()
    db_session.refresh(rule)
    rule_id = rule.id

    try:
        # Non-admin should get 403
        user_override.use(is_admin=False)
        r = client.patch(
            f"/agent/tools/categorize/rules/{rule_id}", json={"priority": 200}
        )
        assert r.status_code == 403, f"Expected 403 for non-admin, got {r.status_code}"

        # Admin should get 200
        user_override.use(is_admin=True)
        r = client.patch(
            f"/agent/tools/categorize/rules/{rule_id}", json={"priority": 200}
        )
        assert r.status_code == 200, f"Expected 200 for admin, got {r.status_code}"
        assert r.json()["ok"] is True
        assert r.json()["rule"]["priority"] == 200
    finally:
        # Cleanup
        db_session.query(CategoryRule).filter(CategoryRule.id == rule_id).delete()
        db_session.commit()


def test_rules_delete_requires_admin(client, user_override, db_session):
    """Test that deleting rules requires admin role."""
    # Create test rules for both attempts
    rule1 = CategoryRule(
        pattern="TEST_DELETE_1", category_slug="test", priority=100, enabled=True
    )
    rule2 = CategoryRule(
        pattern="TEST_DELETE_2", category_slug="test", priority=100, enabled=True
    )
    db_session.add(rule1)
    db_session.add(rule2)
    db_session.commit()
    db_session.refresh(rule1)
    db_session.refresh(rule2)

    # Non-admin should get 403
    user_override.use(is_admin=False)
    r = client.delete(f"/agent/tools/categorize/rules/{rule1.id}")
    assert r.status_code == 403, f"Expected 403 for non-admin, got {r.status_code}"

    # Admin should get 200
    user_override.use(is_admin=True)
    r = client.delete(f"/agent/tools/categorize/rules/{rule2.id}")
    assert r.status_code == 200, f"Expected 200 for admin, got {r.status_code}"
    assert r.json()["ok"] is True

    # Verify deletion
    assert (
        db_session.query(CategoryRule).filter(CategoryRule.id == rule2.id).first()
        is None
    )

    # Cleanup rule1 (wasn't deleted)
    db_session.query(CategoryRule).filter(CategoryRule.id == rule1.id).delete()
    db_session.commit()


def test_rules_test_endpoint_requires_admin(client, user_override):
    """Test that the regex test endpoint requires admin role."""
    test_data = {
        "pattern": "SPOTIFY",
        "samples": ["SPOTIFY MUSIC", "NETFLIX", "SPOTIFY PREMIUM"],
    }

    # Non-admin should get 403
    user_override.use(is_admin=False)
    r = client.post("/agent/tools/categorize/rules/test", json=test_data)
    assert r.status_code == 403, f"Expected 403 for non-admin, got {r.status_code}"

    # Admin should get 200
    user_override.use(is_admin=True)
    r = client.post("/agent/tools/categorize/rules/test", json=test_data)
    assert r.status_code == 200, f"Expected 200 for admin, got {r.status_code}"
    data = r.json()
    assert data["ok"] is True
    assert "matches" in data
    assert "misses" in data
