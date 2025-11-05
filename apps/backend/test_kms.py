#!/usr/bin/env python3
"""Test GCP KMS connectivity"""
import os
import sys

print("🔍 Testing GCP KMS Connectivity\n")

# Check environment variables
print("📋 Environment Variables:")
print(f"  GCP_KMS_KEY: {os.getenv('GCP_KMS_KEY', 'NOT SET')}")
print(f"  GCP_KMS_AAD: {os.getenv('GCP_KMS_AAD', 'NOT SET')}")
print(
    f"  GOOGLE_APPLICATION_CREDENTIALS: {os.getenv('GOOGLE_APPLICATION_CREDENTIALS', 'NOT SET')}"
)
print()

# Try to import KMS
try:
    from google.cloud import kms

    print("✅ google-cloud-kms imported successfully")
except ImportError as e:
    print(f"❌ Cannot import google-cloud-kms: {e}")
    sys.exit(1)

# Try to create KMS client
try:
    client = kms.KeyManagementServiceClient()
    print("✅ KMS client created successfully")
except Exception as e:
    print(f"❌ Cannot create KMS client: {e}")
    sys.exit(1)

# Try to access the key
key_name = os.getenv("GCP_KMS_KEY")
if key_name:
    try:
        key = client.get_crypto_key(name=key_name)
        print(f"✅ KMS key accessible: {key.name}")
        print(f"   Purpose: {key.purpose.name}")
    except Exception as e:
        print(f"❌ Cannot access KMS key: {e}")
        sys.exit(1)
else:
    print("❌ GCP_KMS_KEY not set")
    sys.exit(1)

print("\n🎉 All KMS checks passed!")
