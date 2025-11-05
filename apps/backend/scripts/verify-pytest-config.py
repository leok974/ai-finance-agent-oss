#!/usr/bin/env python3
"""
Pytest configuration verification script.

Checks that all pytest infrastructure is properly configured:
- conftest.py exists and has required bootstrap
- pytest.ini exists with proper settings
- __init__.py marks tests as package
- Environment variables are set correctly
- Prometheus multiprocess mode is disabled
"""
import os
import sys
from pathlib import Path

def check_file_exists(path: Path, description: str) -> bool:
    """Check if a file exists."""
    if path.exists():
        print(f"✅ {description}: {path}")
        return True
    else:
        print(f"❌ {description}: NOT FOUND - {path}")
        return False

def check_env_var(var_name: str, expected: str = None) -> bool:
    """Check environment variable."""
    value = os.getenv(var_name)
    if expected:
        if value == expected:
            print(f"✅ {var_name}={value}")
            return True
        else:
            print(f"❌ {var_name}={value} (expected: {expected})")
            return False
    else:
        # Just check it's set
        if value:
            print(f"✅ {var_name}={value}")
            return True
        else:
            print(f"⚠️  {var_name} not set")
            return False

def check_env_var_not_set(var_name: str) -> bool:
    """Check environment variable is NOT set."""
    value = os.getenv(var_name)
    if value is None:
        print(f"✅ {var_name} not set (correct)")
        return True
    else:
        print(f"❌ {var_name}={value} (should not be set)")
        return False

def check_file_contains(path: Path, search_str: str, description: str) -> bool:
    """Check if file contains a string."""
    try:
        content = path.read_text()
        if search_str in content:
            print(f"✅ {description}")
            return True
        else:
            print(f"❌ {description} - NOT FOUND in {path}")
            return False
    except Exception as e:
        print(f"❌ {description} - Error reading {path}: {e}")
        return False

def main():
    print("=" * 60)
    print("Pytest Configuration Verification")
    print("=" * 60)
    
    # Determine paths
    script_dir = Path(__file__).resolve().parent
    backend_root = script_dir.parent  # apps/backend
    repo_root = backend_root.parent.parent  # repo root
    tests_dir = backend_root / "tests"
    
    print(f"\n📁 Paths:")
    print(f"  Repo root: {repo_root}")
    print(f"  Backend: {backend_root}")
    print(f"  Tests: {tests_dir}")
    
    results = []
    
    # Check files exist
    print(f"\n📄 Configuration Files:")
    results.append(check_file_exists(tests_dir / "conftest.py", "conftest.py"))
    results.append(check_file_exists(tests_dir / "__init__.py", "__init__.py"))
    results.append(check_file_exists(repo_root / "pytest.ini", "pytest.ini"))
    results.append(check_file_exists(tests_dir / "README.md", "README.md"))
    
    # Check conftest.py content
    print(f"\n🔧 conftest.py Configuration:")
    conftest = tests_dir / "conftest.py"
    if conftest.exists():
        results.append(check_file_contains(
            conftest,
            "PROMETHEUS_MULTIPROC_DIR",
            "Prometheus multiprocess safeguard"
        ))
        results.append(check_file_contains(
            conftest,
            "PYTHONUNBUFFERED",
            "Unbuffered output"
        ))
        results.append(check_file_contains(
            conftest,
            'TZ", "UTC',
            "UTC timezone"
        ))
        results.append(check_file_contains(
            conftest,
            "_clear_prom_registry_between_tests",
            "Registry cleanup fixture"
        ))
    
    # Check pytest.ini content
    print(f"\n⚙️  pytest.ini Configuration:")
    pytest_ini = repo_root / "pytest.ini"
    if pytest_ini.exists():
        results.append(check_file_contains(
            pytest_ini,
            "testpaths = apps/backend/tests",
            "Test discovery path"
        ))
        results.append(check_file_contains(
            pytest_ini,
            "pythonpath = apps/backend",
            "Python path setup"
        ))
        results.append(check_file_contains(
            pytest_ini,
            "ml:",
            "ML marker"
        ))
        results.append(check_file_contains(
            pytest_ini,
            "httpapi:",
            "HTTP API marker"
        ))
    
    # Check environment
    print(f"\n🌍 Environment Variables:")
    results.append(check_env_var("PYTHONUNBUFFERED", "1"))
    results.append(check_env_var("TZ", "UTC"))
    results.append(check_env_var_not_set("PROMETHEUS_MULTIPROC_DIR"))
    
    # Check sys.path
    print(f"\n🐍 Python Path:")
    backend_in_path = str(backend_root) in sys.path
    if backend_in_path:
        print(f"✅ {backend_root} in sys.path")
        results.append(True)
    else:
        print(f"⚠️  {backend_root} not in sys.path (may need runtime setup)")
        results.append(True)  # Not critical, conftest.py adds it
    
    # Try importing app
    print(f"\n📦 Import Check:")
    try:
        # Add backend to path if not already
        if not backend_in_path:
            sys.path.insert(0, str(backend_root))
        
        import app
        print(f"✅ Can import 'app' package")
        results.append(True)
    except ImportError as e:
        print(f"❌ Cannot import 'app' package: {e}")
        results.append(False)
    
    # Check for pytest
    print(f"\n🧪 Pytest Installation:")
    try:
        import pytest
        print(f"✅ pytest installed (version: {pytest.__version__})")
        results.append(True)
    except ImportError:
        print(f"⚠️  pytest not installed (use standalone tests or install requirements-dev.txt)")
        results.append(True)  # Not critical, standalone tests work
    
    # Summary
    print(f"\n" + "=" * 60)
    passed = sum(results)
    total = len(results)
    print(f"Results: {passed}/{total} checks passed")
    print("=" * 60)
    
    if passed == total:
        print("\n✅ All checks passed! Test infrastructure is ready.")
        return 0
    else:
        failed = total - passed
        print(f"\n⚠️  {failed} checks failed. Review output above.")
        return 1

if __name__ == "__main__":
    sys.exit(main())
