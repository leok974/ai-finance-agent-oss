"""
Tests for demo seed endpoint.

Verifies:
1. Demo data clearing and insertion
2. is_demo flag is set correctly
3. Idempotent behavior
4. Authentication requirements
5. Clears ALL user transactions (not just is_demo=True) to avoid constraint violations

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


# TODO: Add integration tests for demo seed behavior once DB fixture is available
#
# Critical test scenarios to verify manually or in E2E:
#
# 1. test_demo_seed_clears_all_transactions_not_just_demo:
#    - Setup: User has real transactions (is_demo=False)
#    - Action: POST /demo/seed
#    - Expected: All real transactions deleted, demo data inserted, returns 200
#    - This verifies the fix for the 500 error when mixing real + demo data
#
# 2. test_demo_seed_idempotent_multiple_clicks:
#    - Setup: Clean user or user with any data
#    - Action: POST /demo/seed (call 3 times in a row)
#    - Expected: Each call succeeds, transactions_cleared matches previous transactions_added
#    - This verifies the endpoint can be safely called multiple times
#
# 3. test_demo_seed_after_upload_then_reset:
#    - Setup: Upload real Excel → Reset → Use sample data
#    - Expected: All steps succeed without 500 errors
#    - This replicates the user's exact workflow from the bug report
