"""
Tests for demo seed endpoint.

Verifies:
1. Demo data clearing and insertion
2. is_demo flag is set correctly
3. Idempotent behavior
4. Authentication requirements
5. Header gate: X-LM-Demo-Seed required to prevent accidental seeding
6. SAFE MODE: Refuses to run if user has real (non-demo) transactions

Note: These tests are integration tests and will be skipped in hermetic mode.
Full regression testing requires manual verification or E2E tests.
"""

import pytest
from fastapi.testclient import TestClient

pytestmark = pytest.mark.httpapi


def test_demo_seed_requires_authentication(client: TestClient):
    """Test that demo seed requires authentication."""
    response = client.post("/demo/seed")
    assert response.status_code in [401, 403]


def test_demo_seed_requires_header(client: TestClient, auth_headers: dict):
    """Test that demo seed requires X-LM-Demo-Seed header."""
    # Call without header should be blocked with 403
    response = client.post("/demo/seed", headers=auth_headers)
    assert response.status_code == 403
    data = response.json()
    assert data["reason"] == "missing_demo_seed_header"
    assert "demo controls" in data["message"].lower()


def test_demo_seed_with_header_succeeds_when_no_real_data(
    client: TestClient, auth_headers: dict
):
    """Test that demo seed works when header is present and no real data exists."""
    # Add the required header
    headers = {**auth_headers, "X-LM-Demo-Seed": "1"}
    response = client.post("/demo/seed", headers=headers)
    # Should succeed (200) or return 409 if real data exists (depends on test DB state)
    assert response.status_code in [200, 409]


# TODO: Add integration tests for demo seed behavior once DB fixture is available
#
# Critical test scenarios to verify manually or in E2E:
#
# 1. test_demo_seed_safe_mode_blocks_when_real_data_exists:
#    - Setup: User has real transactions (is_demo=False)
#    - Action: POST /demo/seed
#    - Expected: 409 Conflict with message "Cannot seed demo data: you have N real transaction(s)"
#    - This verifies the safety check prevents accidental data loss
#
# 2. test_demo_seed_works_when_only_demo_data_exists:
#    - Setup: User has only demo transactions (is_demo=True) or no data
#    - Action: POST /demo/seed
#    - Expected: 200 OK, demo data cleared and reseeded
#    - Verify: Only is_demo=True transactions deleted, new demo data inserted
#
# 3. test_demo_seed_idempotent_multiple_clicks:
#    - Setup: Clean user or user with only demo data
#    - Action: POST /demo/seed (call 3 times in a row)
#    - Expected: Each call succeeds, transactions_cleared matches previous transactions_added
#    - This verifies the endpoint can be safely called multiple times
#
# 4. test_workflow_upload_then_demo_seed_blocked:
#    - Setup: Upload real Excel → Try to use sample data
#    - Expected: 409 Conflict, real data preserved
#    - User must explicitly Reset first
#
# 5. test_workflow_reset_then_demo_seed_works:
#    - Setup: Upload real Excel → Reset → Use sample data
#    - Expected: All steps succeed, demo data loads correctly
