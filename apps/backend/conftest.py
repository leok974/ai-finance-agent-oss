"""Root-level hermetic collection filter (signature-flexible).

Skips HTTP-heavy tests and environment / site-packages content while allowing
pure logic tests in hermetic mode. Implements a forward/backward compatible
``pytest_ignore_collect`` that tolerates both pytest<9 and pytest>=9 calling
conventions.
"""

import os
from pathlib import Path
from typing import Any

HERMETIC = os.getenv("HERMETIC") == "1"


def _as_path(obj: Any) -> Path:
    try:
        if isinstance(obj, Path):
            return obj
        sp = getattr(obj, "strpath", None)
        return Path(sp if sp else str(obj))
    except Exception:  # pragma: no cover - defensive
        return Path("")


def _is_env_path(p: Path) -> bool:
    s = str(p)
    return (
        (".venv" in s)
        or ("site-packages" in s)
        or ("dist-packages" in s)
        or ("/usr/" in s)
        or ("\\usr\\" in s)
    )


_HTTP_HINTS = ("test_api", "test_router", "routers", "test_fastapi")


def _looks_httpy(p: Path) -> bool:
    name = p.name.lower()
    parts = [seg.lower() for seg in p.parts]
    if any(h in name for h in _HTTP_HINTS):
        return True
    if "routers" in parts:
        return True
    if "app" in parts and "tests" in parts and ("api" in parts or "router" in parts):
        return True
    return False


def pytest_ignore_collect(*args, **kwargs) -> bool:  # type: ignore
    """Pytest hook to skip certain files in hermetic mode (dual signature).

    Accepted call forms:
      pytest<9: (path, config)
      pytest>=9: (collection_path, path, config)
    We extract the logical 'path' argument in either case.
    """
    if not HERMETIC:
        return False

    # Determine which positional/kw argument corresponds to the path
    if "path" in kwargs:  # explicit kw
        target = kwargs["path"]
    elif len(args) == 2:  # (path, config)
        target = args[0]
    elif len(args) >= 3:  # (collection_path, path, config, ...)
        target = args[1]
    else:  # unexpected shape
        return False

    p = _as_path(target)
    try:
        if _is_env_path(p):
            return True
        if p.suffix == ".py" and _looks_httpy(p):
            return True
        return False
    except Exception:  # pragma: no cover - defensive
        return False
