"""Verify calibrator artifact exists when calibration is enabled.

This script checks that the deployed model includes calibrator.pkl
when ML_CALIBRATION_ENABLED=1. Used in CI and local validation.
"""
import os
import sys
import json
from pathlib import Path


def get_latest_dir():
    """Get the latest model directory path."""
    registry_dir = os.getenv("ML_REGISTRY_DIR", "/app/models/ledger_suggestions")
    latest_path = Path(registry_dir) / "latest"
    
    if not latest_path.exists() or not latest_path.is_dir():
        return None
    
    return str(latest_path)


def main():
    """Main verification logic."""
    # Check if calibration is expected
    calibration_enabled = os.getenv("ML_CALIBRATION_ENABLED", "1") not in ("0", "false", "False")
    
    print(f"Calibration enabled: {calibration_enabled}")
    
    # Get latest model directory
    run_dir = get_latest_dir()
    if not run_dir:
        print("WARNING: No latest model directory found", file=sys.stderr)
        # If calibration is expected but no model exists, this is a soft fail
        # (e.g., in CI before first training)
        sys.exit(2 if calibration_enabled else 0)
    
    print(f"Checking model directory: {run_dir}")
    
    # Check for required files
    pipeline_path = Path(run_dir) / "pipeline.joblib"
    classes_path = Path(run_dir) / "classes.json"
    calibrator_path = Path(run_dir) / "calibrator.pkl"
    
    if not pipeline_path.exists():
        print(f"ERROR: Missing pipeline.joblib in {run_dir}", file=sys.stderr)
        sys.exit(1)
    
    if not classes_path.exists():
        print(f"ERROR: Missing classes.json in {run_dir}", file=sys.stderr)
        sys.exit(1)
    
    # Verify calibrator exists when enabled
    if calibration_enabled and not calibrator_path.exists():
        print(f"ERROR: Expected calibrator.pkl missing in {run_dir}", file=sys.stderr)
        print("ML_CALIBRATION_ENABLED=1 but calibrator not found", file=sys.stderr)
        sys.exit(1)
    
    if not calibration_enabled and calibrator_path.exists():
        print(f"WARNING: calibrator.pkl exists but ML_CALIBRATION_ENABLED=0", file=sys.stderr)
    
    # Optional: print metadata summary from eval.json or meta.json
    meta_path = Path(run_dir) / "meta.json"
    if meta_path.exists():
        try:
            with open(meta_path, "r", encoding="utf-8") as f:
                meta = json.load(f)
            
            summary = {
                "ok": True,
                "run_id": meta.get("run_id", "unknown"),
                "val_f1_macro": meta.get("val_f1_macro"),
                "calibration_enabled": meta.get("calibration_enabled", False),
                "passed_acceptance_gate": meta.get("passed_acceptance_gate", False),
            }
            
            print("\nModel metadata:")
            print(json.dumps(summary, indent=2))
        except Exception as e:
            print(f"WARNING: Could not read meta.json: {e}", file=sys.stderr)
    
    print("\n✅ Calibration artifact check PASSED")
    
    # Print file inventory
    print("\nModel artifacts:")
    for file in Path(run_dir).iterdir():
        if file.is_file():
            size_kb = file.stat().st_size / 1024
            print(f"  - {file.name} ({size_kb:.1f} KB)")
    
    return 0


if __name__ == "__main__":
    sys.exit(main())
