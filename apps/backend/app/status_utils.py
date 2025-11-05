from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Optional

from sqlalchemy import create_engine, text

try:  # Alembic imports (optional during certain build phases)
    from alembic.config import Config as AlembicConfig
    from alembic.script import ScriptDirectory
    from alembic.runtime.environment import EnvironmentContext
except Exception:  # pragma: no cover - alembic not available
    AlembicConfig = ScriptDirectory = EnvironmentContext = None  # type: ignore


@dataclass
class DBStatus:
    ok: bool
    error: Optional[str] = None


@dataclass
class MigStatus:
    ok: bool
    current: Optional[str] = None
    head: Optional[str] = None
    error: Optional[str] = None


@dataclass
class CryptoStatus:
    ok: bool
    mode: Optional[str] = None  # e.g., "kms" | "local" | "disabled"
    label: Optional[str] = None
    error: Optional[str] = None


@dataclass
class LLMStatus:
    ok: bool
    path: Optional[str] = None  # "primary" | "fallback-openai" | etc.
    error: Optional[str] = None


def check_db(url: str) -> DBStatus:
    """Simple synchronous DB connectivity check (no ORM metadata load).

    Uses existing global engine when URL matches to avoid transient new engine creation
    (prevents leaked connections / ResourceWarnings in tests). Falls back to a one-off
    ephemeral engine only if necessary (e.g., different URL passed explicitly).
    """
    try:
        try:
            from app.db import engine as global_engine  # type: ignore
        except Exception:  # pragma: no cover - fallback path
            global_engine = None  # type: ignore
        eng = None
        if global_engine is not None:
            try:
                if str(global_engine.url) == url:
                    eng = global_engine
            except Exception:
                pass
        if eng is None:
            # Fallback ephemeral engine (will GC quickly). Not using pool_pre_ping to keep it lean.
            eng = create_engine(url, future=True)
        with eng.connect() as c:
            c.execute(text("select 1"))
        return DBStatus(ok=True)
    except Exception as e:  # broad: only class name to avoid secret leakage
        return DBStatus(ok=False, error=type(e).__name__)


def check_migrations(alembic_ini_path: str = "alembic.ini") -> MigStatus:
    """Compare current vs head migrations.

    Falls back gracefully if alembic modules aren't importable (e.g. minimal builds).
    """
    if AlembicConfig is None:
        return MigStatus(ok=False, error="alembic_unavailable")
    try:
        cfg = AlembicConfig(alembic_ini_path)
        script = ScriptDirectory.from_config(cfg)
        head_rev = script.get_current_head()
        current_rev: Optional[str] = None

        def _rev_fn(rev, context):  # type: ignore
            nonlocal current_rev
            current_rev = context.get_current_revision()
            return []

        with EnvironmentContext(cfg, script, fn=_rev_fn):  # type: ignore
            script.run_env()

        return MigStatus(
            ok=(current_rev == head_rev),
            current=current_rev,
            head=head_rev,
        )
    except Exception as e:
        return MigStatus(ok=False, error=type(e).__name__)


def check_crypto_via_env() -> CryptoStatus:
    """Lightweight crypto signal from environment.

    Replace with a real provider (e.g., kms_client.status()) when available.
    """
    enabled = os.getenv("ENCRYPTION_ENABLED", "0").lower() in {"1", "true", "yes", "on"}
    label = os.getenv("ACTIVE_DEK_LABEL")
    if not enabled:
        # Explicitly disabled — report healthy 'disabled' mode so readiness doesn't fail
        return CryptoStatus(ok=True, mode="disabled", label=label)
    mode = os.getenv("ENCRYPTION_MODE") or os.getenv("CRYPTO_MODE")
    if not mode:
        return CryptoStatus(ok=False, mode=None, label=label, error="no_mode")
    return CryptoStatus(ok=True, mode=mode, label=label)


def check_llm_health_sync() -> LLMStatus:
    """Placeholder LLM health.

    If you have a real health probe (e.g., llm_client.health()), call it here.
    """
    try:
        path = os.getenv("X_LLM_DEFAULT_PATH") or "primary"
        return LLMStatus(ok=True, path=path)
    except Exception as e:  # pragma: no cover
        return LLMStatus(ok=False, error=type(e).__name__)


__all__ = [
    "DBStatus",
    "MigStatus",
    "CryptoStatus",
    "LLMStatus",
    "check_db",
    "check_migrations",
    "check_crypto_via_env",
    "check_llm_health_sync",
]
