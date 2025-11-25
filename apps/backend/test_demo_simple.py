"""Simple test for demo auth - focuses on /auth/demo endpoint only."""

import sys
import os

# Disable dev bypass to avoid SQLite now() issue
os.environ["DEV_ALLOW_NO_AUTH"] = "0"

sys.path.insert(0, "apps/backend")

from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

print("=" * 60)
print("TEST: POST /auth/demo")
print("=" * 60)

response = client.post("/auth/demo")
print(f"Status: {response.status_code}")

if response.status_code == 200:
    data = response.json()
    print(f"\n✓ Demo login successful")
    print(f"  Email: {data['user']['email']}")
    print(f"  Name: {data['user']['name']}")
    print(f"  is_demo: {data['user'].get('is_demo')}")
    
    # Verify is_demo is True
    if data['user'].get('is_demo') == True:
        print("\n✅ SUCCESS: Demo user has is_demo=True")
        
        # Now check /auth/me endpoint returns is_demo
        access_token = data.get('access_token')
        headers = {"Authorization": f"Bearer {access_token}"}
        
        print("\n" + "=" * 60)
        print("TEST: GET /auth/me (with demo token)")
        print("=" * 60)
        
        me_response = client.get("/auth/me", headers=headers)
        print(f"Status: {me_response.status_code}")
        
        if me_response.status_code == 200:
            me_data = me_response.json()
            print(f"\n✓ /auth/me successful")
            print(f"  Full response: {me_data}")
            print(f"  Email: {me_data.get('email')}")
            print(f"  is_demo: {me_data.get('is_demo')}")
            
            if me_data.get('is_demo') == True:
                print("\n✅✅ FULL SUCCESS: /auth/me returns is_demo=True!")
                print("\nFrontend demo banner will now show correctly!")
            else:
                print(f"\n❌ FAILED: is_demo is {me_data.get('is_demo')} (expected True)")
        else:
            print(f"\n❌ /auth/me failed: {me_response.json()}")
    else:
        print(f"\n❌ FAILED: is_demo is {data['user'].get('is_demo')} (expected True)")
else:
    print(f"\n❌ Demo login failed: {response.json()}")
