"""Routers package.

Hermetic mode: do not import any HTTP router submodules to avoid pulling in
FastAPI / Starlette / heavy deps during offline or stubbed test runs.
Normal mode: (optionally) import and re-export router modules.
"""

import os as _os

if _os.getenv("HERMETIC") == "1":  # Skip auto-imports entirely
	__all__: list[str] = []
else:  # Non-hermetic runtime: import submodules if present
	try:  # pragma: no cover - trivial guard
		from . import txns_edit  # type: ignore  # re-export for app.routers import style
	except Exception:  # noqa: BLE001
		txns_edit = None  # type: ignore
	__all__ = [n for n in ["txns_edit"] if globals().get(n) is not None]

