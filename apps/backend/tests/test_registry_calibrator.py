"""Tests for ML model registry calibrator artifacts."""
import os
import pytest
from pathlib import Path


def get_latest_dir():
    """Get the latest model directory path."""
    registry_dir = os.getenv("ML_REGISTRY_DIR", "/app/models/ledger_suggestions")
    latest_path = Path(registry_dir) / "latest"
    
    if not latest_path.exists() or not latest_path.is_dir():
        return None
    
    return str(latest_path)


def test_latest_has_calibrator_when_enabled(monkeypatch):
    """Verify calibrator.pkl exists in latest model when calibration enabled."""
    monkeypatch.setenv("ML_CALIBRATION_ENABLED", "1")
    
    model_dir = get_latest_dir()
    
    # If no model yet, skip (pipeline not trained in unit test env)
    if not model_dir:
        pytest.skip("No model deployed yet (expected in fresh environment)")
        return
    
    calibrator_path = Path(model_dir) / "calibrator.pkl"
    
    assert calibrator_path.exists(), (
        f"Missing calibrator.pkl in latest model dir: {model_dir}\n"
        "Expected when ML_CALIBRATION_ENABLED=1"
    )


def test_latest_has_required_files(monkeypatch):
    """Verify all required model artifacts exist."""
    model_dir = get_latest_dir()
    
    if not model_dir:
        pytest.skip("No model deployed yet")
        return
    
    required_files = ["pipeline.joblib", "classes.json"]
    
    for filename in required_files:
        file_path = Path(model_dir) / filename
        assert file_path.exists(), f"Missing required file: {filename} in {model_dir}"


def test_calibrator_not_required_when_disabled(monkeypatch):
    """Verify test passes when calibration disabled (no requirement)."""
    monkeypatch.setenv("ML_CALIBRATION_ENABLED", "0")
    
    model_dir = get_latest_dir()
    
    if not model_dir:
        pytest.skip("No model deployed yet")
        return
    
    # With calibration disabled, we don't enforce calibrator.pkl presence
    # This test just ensures the logic doesn't fail
    calibrator_path = Path(model_dir) / "calibrator.pkl"
    
    # No assertion - just documenting that it's optional when disabled
    if calibrator_path.exists():
        print(f"Note: calibrator.pkl exists even though disabled (harmless)")


def test_registry_structure():
    """Verify registry directory structure exists."""
    registry_dir = os.getenv("ML_REGISTRY_DIR", "/app/models/ledger_suggestions")
    registry_path = Path(registry_dir)
    
    # Registry dir should exist (created during app init)
    if not registry_path.exists():
        pytest.skip("Registry directory not initialized yet")
        return
    
    assert registry_path.is_dir(), f"Registry path exists but is not a directory: {registry_dir}"
    
    # Check for latest symlink or directory
    latest_path = registry_path / "latest"
    if latest_path.exists():
        assert latest_path.is_dir() or latest_path.is_symlink(), (
            f"'latest' exists but is not a directory or symlink"
        )
