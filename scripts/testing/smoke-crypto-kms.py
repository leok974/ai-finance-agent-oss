#!/usr/bin/env python3
"""
KMS Crypto Health Smoke Test

Verifies that the backend is running with GCP KMS encryption enabled.
Checks:
  1. crypto_mode == "kms"
  2. crypto_ready == true

Usage:
  python scripts/smoke-crypto-kms.py                                    # Default: http://localhost:8000
  python scripts/smoke-crypto-kms.py --base-url https://api.ledger-mind.org
  python scripts/smoke-crypto-kms.py --base-url http://127.0.0.1:8000

Exit Codes:
  0 - Success (KMS mode active and ready)
  1 - Failure (crypto_mode != kms OR crypto_ready != true OR connection error)
"""

import sys
import argparse
from urllib.request import urlopen, Request
from urllib.error import URLError, HTTPError
import json


def check_kms_health(base_url: str) -> tuple[bool, str]:
    """
    Check KMS health endpoint.

    Returns:
        (success: bool, message: str)
    """
    healthz_url = f"{base_url.rstrip('/')}/healthz"

    try:
        req = Request(healthz_url)
        req.add_header("User-Agent", "kms-crypto-smoke/1.0")

        with urlopen(req, timeout=10) as response:
            if response.status != 200:
                return False, f"HTTP {response.status}"

            data = json.loads(response.read().decode("utf-8"))

            crypto_mode = data.get("crypto_mode")
            crypto_ready = data.get("crypto_ready")
            status = data.get("status")

            # Check results
            if crypto_mode != "kms":
                return False, f"crypto_mode is '{crypto_mode}' (expected 'kms')"

            if not crypto_ready:
                return False, f"crypto_ready is {crypto_ready} (expected True)"

            return True, f"KMS mode active and healthy (status: {status})"

    except HTTPError as e:
        return False, f"HTTP error {e.code}: {e.reason}"
    except URLError as e:
        return False, f"Connection error: {e.reason}"
    except json.JSONDecodeError as e:
        return False, f"JSON decode error: {e}"
    except Exception as e:
        return False, f"Unexpected error: {e}"


def main():
    parser = argparse.ArgumentParser(
        description="KMS Crypto Health Smoke Test",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "--base-url",
        default="http://localhost:8000",
        help="Base URL of the backend API (default: http://localhost:8000)",
    )
    parser.add_argument("-v", "--verbose", action="store_true", help="Verbose output")

    args = parser.parse_args()

    print("🔍 KMS Crypto Smoke Test")
    print(f"Testing: {args.base_url}")
    print()

    success, message = check_kms_health(args.base_url)

    if success:
        print(f"✅ PASS: {message}")
        return 0
    else:
        print(f"❌ FAIL: {message}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
