"""sitecustomize: force lightweight stubs for hermetic test environment.

Loads before any application imports. Ensures modules like `annotated_types`
exist so pydantic v2 doesn't crash, without installing real wheels.

Environment variables:
  HERMETIC_FORCE_STUB=mod1,mod2  -> always use our stub even if real pkg exists
  HERMETIC_DEBUG=1               -> emit debug lines to stderr
"""
from __future__ import annotations
import sys, os, importlib, importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parent
STUBS = ROOT / "app" / "_stubs"

def _dbg(msg: str):  # pragma: no cover - debug utility
    if os.getenv("HERMETIC_DEBUG") == "1":
        try:
            print(f"[sitecustomize] {msg}", file=sys.stderr)
        except Exception:
            pass

def _force_stub(modname: str, filename: str | None = None):
    wanted = {s.strip() for s in os.getenv("HERMETIC_FORCE_STUB", "").split(",") if s.strip()}
    real_present = False
    if modname not in wanted:
        try:
            importlib.import_module(modname)
            real_present = True
        except Exception:
            pass
    if real_present:
        _dbg(f"real module present: {modname} (no stub)")
        return
    path = STUBS / (filename or f"{modname}.py")
    if not path.is_file():
        _dbg(f"stub file missing for {modname}: {path}")
        return
    spec = importlib.util.spec_from_file_location(modname, str(path))
    if not spec or not spec.loader:  # pragma: no cover
        _dbg(f"spec load failed for {modname}")
        return
    module = importlib.util.module_from_spec(spec)
    try:
        spec.loader.exec_module(module)  # type: ignore
        sys.modules[modname] = module
        _dbg(f"stubbed {modname} -> {path}")
    except Exception as e:  # pragma: no cover
        _dbg(f"failed executing stub {modname}: {e}")

# Always stub annotated_types early (pydantic imports it at module import time)
_force_stub("annotated_types")

hermetic = os.getenv("HERMETIC") == "1"
# Conditionally stub fastapi if it's not installed (hermetic env still prefers real if available)
if os.getenv("HERMETIC_STUB_FASTAPI", "1") == "1":  # default on for hermetic
    try:
        importlib.import_module("fastapi")  # real package available?
        _dbg("fastapi present; not stubbing")
    except Exception:
        _force_stub("fastapi")

# Always attempt to provide a fastapi.testclient namespace in hermetic mode so imports never fail
if hermetic:
    try:
        fq = "fastapi.testclient"
        if fq not in sys.modules:
            # If real fastapi has provided the submodule, this import will succeed; else use stub
            try:
                importlib.import_module(fq)
                _dbg("real fastapi.testclient present")
            except Exception:
                sub_path = STUBS / "fastapi_testclient.py"
                if sub_path.is_file():
                    spec = importlib.util.spec_from_file_location(fq, str(sub_path))
                    if spec and spec.loader:  # pragma: no cover - thin loader
                        mod = importlib.util.module_from_spec(spec)
                        spec.loader.exec_module(mod)  # type: ignore
                        sys.modules[fq] = mod
                        _dbg("stubbed fastapi.testclient (hermetic)")
    except Exception as e:  # pragma: no cover - defensive
        _dbg(f"failed stubbing fastapi.testclient: {e}")

# Additional stubs could be added here if future hermetic gaps arise.

