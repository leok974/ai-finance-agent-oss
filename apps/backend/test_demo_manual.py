"""Manual test for demo auth endpoints."""

import sys

sys.path.insert(0, "apps/backend")

from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

# Test 1: Demo login
print("=" * 60)
print("TEST 1: POST /auth/demo")
print("=" * 60)

response = client.post("/auth/demo")
print(f"Status: {response.status_code}")
print(f"Response: {response.json()}")

if response.status_code == 200:
    data = response.json()
    print("\n✓ Demo login successful")
    print(f"  User: {data['user']['email']}")
    print(f"  is_demo: {data['user'].get('is_demo')}")

    # Extract access token for next request
    access_token = data.get("access_token")
    headers = {"Authorization": f"Bearer {access_token}"}

    # Test 2: Check /auth/me with demo session
    print("\n" + "=" * 60)
    print("TEST 2: GET /auth/me (with demo session)")
    print("=" * 60)

    me_response = client.get("/auth/me", headers=headers)
    print(f"Status: {me_response.status_code}")
    print(f"Response: {me_response.json()}")

    if me_response.status_code == 200:
        me_data = me_response.json()
        print("\n✓ /auth/me successful")
        print(f"  Email: {me_data.get('email')}")
        print(f"  is_demo: {me_data.get('is_demo')}")

        if me_data.get("is_demo"):
            print("\n✅ SUCCESS: is_demo field is returned!")
        else:
            print("\n❌ FAILED: is_demo field is False or missing")
    else:
        print("\n❌ /auth/me failed")

    # Test 3: Bootstrap demo data
    print("\n" + "=" * 60)
    print("TEST 3: POST /demo/bootstrap")
    print("=" * 60)

    bootstrap_response = client.post("/demo/bootstrap", headers=headers)
    print(f"Status: {bootstrap_response.status_code}")
    print(f"Response: {bootstrap_response.json()}")

    if bootstrap_response.status_code == 200:
        print("\n✓ Demo bootstrap successful")
    else:
        print("\n❌ Bootstrap failed")
else:
    print("\n❌ Demo login failed")

print("\n" + "=" * 60)
print("TESTS COMPLETE")
print("=" * 60)
