"""Lightweight FastAPI stub for hermetic test environments.
Provides minimal symbols so modules importing FastAPI don't crash when the
real dependency isn't installed. NOT a functional replacement.
"""

from __future__ import annotations
from typing import Any, Callable, List, Dict, Optional


class HTTPException(Exception):
    def __init__(self, status_code: int, detail: Any = None):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


class BackgroundTasks:
    def __init__(self):
        self.tasks: List[tuple[Callable, tuple, dict]] = []

    def add_task(self, fn: Callable, *a, **k):
        self.tasks.append((fn, a, k))


class Request:
    def __init__(self, headers: Optional[Dict[str, str]] = None):
        self.headers = headers or {}


# Dependency helpers (no-op)
def Depends(dep: Any):
    return dep


def Query(default=None, *_, **__):
    return default


def Header(default=None, *_, **__):
    return default


class FastAPI:  # Minimal placeholder so 'from fastapi import FastAPI' works
    def __init__(self, *_, **__):
        self.router = None

    def include_router(self, router, *_, **__):
        self.router = router


class APIRouter:
    def __init__(self, *_, **__):
        self.routes = []

    def _reg(self, method: str, path: str, **meta):
        def deco(fn: Callable):
            self.routes.append((method, path, fn, meta))
            return fn

        return deco

    def get(self, path: str, **meta):
        return self._reg("GET", path, **meta)

    def post(self, path: str, **meta):
        return self._reg("POST", path, **meta)

    def put(self, path: str, **meta):
        return self._reg("PUT", path, **meta)

    def delete(self, path: str, **meta):
        return self._reg("DELETE", path, **meta)

    def include_router(self, router: "APIRouter", *_, **__):
        # Merge routes
        for r in getattr(router, "routes", []):
            self.routes.append(r)


__all__ = [
    "FastAPI",
    "APIRouter",
    "HTTPException",
    "Depends",
    "Query",
    "Header",
    "BackgroundTasks",
    "Request",
]

# Make this module appear package-like so 'fastapi.testclient' namespace can be injected
__path__ = []  # type: ignore
