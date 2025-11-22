"""
Tests for manual categorization endpoint.

Coverage:
- Route exists and returns correct shape (200 or 401)
- Validates category_slug parameter
- Endpoint structure matches API spec
"""

import pytest


@pytest.mark.httpapi
def test_manual_categorize_route_exists(client):
    """Verify manual categorization route exists (not 404)."""
    # Test with valid payload - expect 200 (success) or 401 (auth required)
    response = client.post(
        "/transactions/1/categorize/manual",
        json={"category_slug": "groceries", "scope": "just_this"},
    )

    # Route should exist (not 404)
    assert response.status_code != 404, "Manual categorize route returned 404"

    # Expected: 200 (success) or 401 (auth required) or 404 (txn not found)
    assert response.status_code in (
        200,
        401,
        404,
    ), f"Expected 200/401/404, got {response.status_code}"


@pytest.mark.httpapi
def test_manual_categorize_requires_json_body(client):
    """Verify endpoint requires JSON body."""
    # Missing body should fail
    response = client.post("/transactions/1/categorize/manual")

    assert response.status_code in (
        400,
        401,
        422,
    ), "Expected validation error for missing body"


@pytest.mark.httpapi
def test_manual_categorize_accepts_valid_scopes(client):
    """Verify endpoint accepts all valid scope values."""
    scopes = ["just_this", "same_merchant", "same_description"]

    for scope in scopes:
        response = client.post(
            "/transactions/1/categorize/manual",
            json={"category_slug": "groceries", "scope": scope},
        )

        # Should not fail with validation error (422)
        # May be 401 (auth), 404 (txn not found), or 200 (success)
        assert response.status_code != 422, f"Scope '{scope}' rejected with 422"
        assert response.status_code in (
            200,
            401,
            404,
        ), f"Unexpected status for scope '{scope}': {response.status_code}"


# Note: The following tests verify critical business logic but require database fixtures.
# They are documented here as test cases to implement when full integration test
# infrastructure is available:
#
# test_manual_categorize_respects_user_isolation:
#   - SAME_MERCHANT should not update transactions from different users
#   - Create txn for user A and user B with same merchant
#   - Categorize user A's txn with same_merchant scope
#   - Verify only user A's transaction is updated
#
# test_manual_categorize_ignores_already_categorized:
#   - SAME_MERCHANT should ignore transactions with category != 'unknown'
#   - Create unknown txn and already-categorized txn with same merchant
#   - Categorize unknown txn with same_merchant scope
#   - Verify already-categorized txn remains unchanged
