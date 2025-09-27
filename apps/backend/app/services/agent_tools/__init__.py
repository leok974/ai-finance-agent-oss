"""Agent tools package.

We intentionally avoid importing the heavy core routing logic at package import
time so that hermetic test preflight (which only checks for the attribute
presence) does not trigger downstream imports of analytics / cryptography
dependencies. Access route_to_tool via attribute access which performs a
lazy import on first use.
"""

from importlib import import_module
from typing import Any

def __getattr__(name: str) -> Any:  # pragma: no cover - thin loader
	if name == "route_to_tool":
		mod = import_module("app.services.agent_tools.core")
		return getattr(mod, name)
	raise AttributeError(name)

__all__ = ["route_to_tool"]

