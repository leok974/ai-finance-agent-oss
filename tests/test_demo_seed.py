#!/usr/bin/env python3
"""Test demo seed functionality"""
import sys
sys.path.insert(0, '/app')

from app.routers import demo_seed
from app.db import SessionLocal

print('Testing CSV load...')
try:
    rows = demo_seed.load_demo_csv()
    print(f'✓ Loaded {len(rows)} rows from CSV')
except Exception as e:
    print(f'✗ CSV load failed: {e}')
    import traceback
    traceback.print_exc()
    sys.exit(1)

print('\nTesting seed function...')
db = SessionLocal()
try:
    count = demo_seed.seed_demo_data_for_user(999999, db)
    print(f'✓ Seed returned: {count} transactions')
except Exception as e:
    print(f'✗ Seed failed: {e}')
    import traceback
    traceback.print_exc()
    sys.exit(1)
finally:
    db.close()

print('\n✓ All tests passed')
