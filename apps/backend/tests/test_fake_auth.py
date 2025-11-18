"""Test that TEST_FAKE_AUTH=1 bypasses authentication for E2E tests."""
import os
import pytest
from fastapi.testclient import TestClient


@pytest.fixture(autouse=True)
def enable_fake_auth():
    """Enable fake auth for all tests in this module."""
    os.environ["TEST_FAKE_AUTH"] = "1"
    yield
    os.environ.pop("TEST_FAKE_AUTH", None)


def test_fake_auth_bypasses_real_auth_for_transactions_summary(client: TestClient):
    """Verify that authed endpoints work without cookies when TEST_FAKE_AUTH=1."""
    # No auth headers, no cookies - should still succeed with TEST_FAKE_AUTH=1
    resp = client.get("/api/transactions/summary")
    
    # Should not return 401 or 403
    assert resp.status_code in (200, 404), f"Expected 200 or 404, got {resp.status_code}: {resp.text}"
    
    # 404 is OK if no data exists for fake user; 200 means endpoint is accessible
    if resp.status_code == 200:
        data = resp.json()
        assert isinstance(data, dict), "Response should be a dictionary"


def test_fake_auth_bypasses_real_auth_for_ingest(client: TestClient):
    """Verify CSV ingest endpoint works without auth when TEST_FAKE_AUTH=1."""
    csv_content = "date,amount,description,merchant\n2025-11-01,-50.00,Test,Store\n"
    
    resp = client.post(
        "/api/ingest?replace=true",
        files={"file": ("test.csv", csv_content, "text/csv")}
    )
    
    # Should succeed (or fail with business logic error, but not 401)
    assert resp.status_code != 401, f"Should not get 401 with TEST_FAKE_AUTH=1: {resp.text}"
    assert resp.status_code != 403, f"Should not get 403 with TEST_FAKE_AUTH=1: {resp.text}"
    
    # Expect 200 with successful parse or validation error (but not auth error)
    assert resp.status_code in (200, 422, 500), f"Unexpected status {resp.status_code}: {resp.text}"


def test_fake_auth_bypasses_real_auth_for_charts(client: TestClient):
    """Verify charts endpoint works without auth when TEST_FAKE_AUTH=1."""
    resp = client.get("/api/charts/spending-by-category")
    
    # Should not return 401 or 403
    assert resp.status_code in (200, 404, 422), f"Expected 200/404/422, got {resp.status_code}: {resp.text}"
    
    # If successful, should return chart data structure
    if resp.status_code == 200:
        data = resp.json()
        assert isinstance(data, dict), "Chart response should be a dictionary"


def test_fake_auth_creates_stable_user(client: TestClient):
    """Verify that TEST_FAKE_AUTH creates the same user across requests."""
    # Make two requests and verify they're authenticated as the same user
    resp1 = client.get("/api/auth/me")
    resp2 = client.get("/api/auth/me")
    
    assert resp1.status_code == 200, f"First /auth/me failed: {resp1.text}"
    assert resp2.status_code == 200, f"Second /auth/me failed: {resp2.text}"
    
    user1 = resp1.json()
    user2 = resp2.json()
    
    assert user1["email"] == "e2e-test-user@example.com", "Should use stable fake email"
    assert user1["email"] == user2["email"], "Should return same user across requests"
    assert user1["id"] == user2["id"], "Should have same user ID across requests"


def test_fake_auth_grants_all_roles(client: TestClient):
    """Verify that fake auth user has admin privileges for testing."""
    resp = client.get("/api/auth/me")
    
    assert resp.status_code == 200, f"/auth/me failed: {resp.text}"
    
    user = resp.json()
    roles = [r["name"] for r in user.get("roles", [])]
    
    assert "user" in roles, "Fake user should have 'user' role"
    assert "admin" in roles, "Fake user should have 'admin' role for unrestricted testing"
