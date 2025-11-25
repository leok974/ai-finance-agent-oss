#!/usr/bin/env python3
"""Test all 5 explainer endpoints."""
import requests

panels = [
    "charts.month_merchants",
    "charts.month_categories",
    "charts.daily_flows",
    "charts.month_anomalies",
    "charts.insights_overview",
]

month = "2025-11"

print("=" * 60)
print("Testing All Explainers")
print("=" * 60)

for panel_id in panels:
    print(f"\n{'='*60}")
    print(f"Panel: {panel_id}")
    print(f"{'='*60}")

    try:
        response = requests.get(
            f"http://localhost:8000/agent/describe/{panel_id}", params={"month": month}
        )

        if response.status_code == 200:
            data = response.json()
            print(f"✓ Status: {response.status_code}")
            print(f"  Title: {data.get('title', 'N/A')}")
            print(f"  What: {data.get('what', 'N/A')[:100]}...")
            print(f"  Why: {data.get('why', 'N/A')[:100]}...")
            print(f"  Actions: {len(data.get('actions', []))} items")
        else:
            print(f"✗ Status: {response.status_code}")
            print(f"  Error: {response.text[:200]}")
    except Exception as e:
        print(f"✗ Exception: {e}")

# Check metrics
print(f"\n{'='*60}")
print("Metrics Summary")
print(f"{'='*60}")

try:
    metrics = requests.get("http://localhost:8000/metrics").text

    # Extract help metrics
    help_lines = [
        line
        for line in metrics.split("\n")
        if "lm_help_" in line and not line.startswith("#")
    ]

    print("\nHelp Request Metrics:")
    for line in sorted(help_lines):
        if "lm_help_requests_total" in line:
            print(f"  {line}")

    print("\nRAG Metrics:")
    for line in sorted(help_lines):
        if "lm_help_rag_" in line:
            print(f"  {line}")

except Exception as e:
    print(f"✗ Could not fetch metrics: {e}")

print("\n" + "=" * 60)
print("Test Complete")
print("=" * 60)
