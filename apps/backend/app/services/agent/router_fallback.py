from __future__ import annotations
from typing import Any, Dict, Optional, Callable
import importlib
from importlib.util import spec_from_file_location, module_from_spec
from pathlib import Path


def _reload_route_to_tool() -> Optional[Callable]:
    try:
        mod = importlib.import_module("app.services.agent_tools")
        importlib.reload(mod)
        return getattr(mod, "route_to_tool", None)
    except Exception:
        return None


def _legacy_route_to_tool_by_path() -> Optional[Callable]:
    here = Path(__file__).resolve()
    legacy = here.parent.parent / "agent_tools.py"
    if not legacy.exists():
        return None
    try:
        spec = spec_from_file_location(
            "app.services._agent_tools_legacy_fallback", legacy
        )
        if not spec or not spec.loader:
            return None
        m = module_from_spec(spec)
        spec.loader.exec_module(m)  # type: ignore[attr-defined]
        return getattr(m, "route_to_tool", None)
    except Exception:
        return None


def route_to_tool_with_fallback(
    user_text: str, *, ctx: Any, db=None
) -> Optional[Dict[str, Any]]:
    """Attempt normal route_to_tool; on None, try reload; then legacy path.
    Accepts db optionally for forward compatibility; passes through when signature matches.
    """
    # 1) normal import
    try:
        mod = importlib.import_module("app.services.agent_tools")
        fn = getattr(mod, "route_to_tool", None)
        if callable(fn):
            try:
                # Support both (user_text, db) and (user_text, ctx=db) styles
                if db is not None:
                    out = fn(user_text, db)
                else:
                    out = fn(user_text, ctx)
                if out is not None:
                    return out
            except TypeError:
                try:
                    out = fn(user_text, db)
                    if out is not None:
                        return out
                except Exception:
                    pass
    except Exception:
        pass

    # 2) reload and retry
    fn = _reload_route_to_tool()
    if callable(fn):
        try:
            if db is not None:
                out = fn(user_text, db)
            else:
                out = fn(user_text, ctx)
            if out is not None:
                return out
        except Exception:
            pass

    # 3) legacy by path
    fn = _legacy_route_to_tool_by_path()
    if callable(fn):
        try:
            if db is not None:
                out = fn(user_text, db)
            else:
                out = fn(user_text, ctx)
            if out is not None:
                return out
        except Exception:
            pass

    return None
