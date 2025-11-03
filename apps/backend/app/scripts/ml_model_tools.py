"""Utility script for managing ML model files."""

import os
import sys

# Import model path from ml_scorer
try:
    from app.services.ml_scorer import MODEL_PATH
except ImportError:
    MODEL_PATH = os.getenv("ML_SUGGEST_MODEL_PATH", "/app/data/ml_suggest.joblib")


def wipe():
    """Remove the ML model file if it exists."""
    if os.path.exists(MODEL_PATH):
        try:
            os.remove(MODEL_PATH)
            print(f"[ml] removed {MODEL_PATH}")
            return True
        except Exception as e:
            print(f"[ml] error removing {MODEL_PATH}: {e}", file=sys.stderr)
            return False
    else:
        print(f"[ml] no model at {MODEL_PATH}")
        return True


def info():
    """Show information about the ML model file."""
    print(f"[ml] model path: {MODEL_PATH}")
    if os.path.exists(MODEL_PATH):
        try:
            size = os.path.getsize(MODEL_PATH)
            print(f"[ml] model exists: {size} bytes")
            import time

            mtime = os.path.getmtime(MODEL_PATH)
            print(f"[ml] last modified: {time.ctime(mtime)}")
        except Exception as e:
            print(f"[ml] error reading model info: {e}", file=sys.stderr)
    else:
        print("[ml] model does not exist")


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "wipe"

    if cmd == "wipe":
        success = wipe()
        sys.exit(0 if success else 1)
    elif cmd == "info":
        info()
    else:
        print(
            "usage: python -m app.scripts.ml_model_tools [wipe|info]", file=sys.stderr
        )
        sys.exit(1)
