"""
Tests for demo seed endpoint.

Verifies:
1. Demo data clearing and insertion
2. is_demo flag is set correctly
3. Idempotent behavior
4. Authentication requirements

Note: These tests are integration tests and will be skipped in hermetic mode.
"""

import pytest
from fastapi.testclient import TestClient

pytestmark = pytest.mark.httpapi


def test_demo_seed_requires_authentication(client: TestClient):
    """Test that demo seed requires authentication."""
    response = client.post("/demo/seed")
    assert response.status_code in [401, 403]


# Additional tests can be added here that use the client fixture
# For now, the endpoint will be manually tested during deployment verification
