import os
import sys

__ENV_BOOT_APPLIED = False

# Additional guard using environment so multiple worker processes won't duplicate prints.
if os.getenv("ENV_BOOT_APPLIED") == "1":
    __ENV_BOOT_APPLIED = True
else:
    os.environ["ENV_BOOT_APPLIED"] = "1"


def _load_db_url_from_file() -> str | None:
    global __ENV_BOOT_APPLIED
    if __ENV_BOOT_APPLIED:
        return os.getenv("DATABASE_URL")
    __ENV_BOOT_APPLIED = True
    path = os.getenv("DATABASE_URL_FILE")
    if path and not os.getenv("DATABASE_URL"):
        try:
            with open(path, "r", encoding="utf-8") as f:
                val = f.read().strip()
            if val:
                os.environ["DATABASE_URL"] = val
                scheme = val.split(":", 1)[0] if ":" in val else "unknown"
                print(f"[env] DATABASE_URL set from {path} (scheme={scheme})")
                return val
        except Exception as e:  # pragma: no cover
            print(
                f"[env] warn: failed to read DATABASE_URL_FILE={path}: {e}",
                file=sys.stderr,
            )
    return os.getenv("DATABASE_URL")


loaded = _load_db_url_from_file()

if loaded:
    try:
        from app import config as _cfg_mod  # type: ignore

        if getattr(_cfg_mod.settings, "DATABASE_URL", "").startswith(
            "sqlite"
        ) and not loaded.startswith("sqlite"):
            _cfg_mod.settings.DATABASE_URL = loaded  # type: ignore[attr-defined]
            print("[env] patched settings.DATABASE_URL from secret file")
    except Exception as _e:  # pragma: no cover
        print(f"[env] warn: failed to patch settings object: {_e}", file=sys.stderr)

# Production guard: refuse sqlite in prod very early.
try:
    env = os.getenv("APP_ENV", os.getenv("ENV", "")).lower()
    if env == "prod":
        dbu = os.getenv("DATABASE_URL", "")
        if dbu.startswith("sqlite"):
            print(
                "[env] ERROR: sqlite DATABASE_URL in prod; refusing to start.",
                file=sys.stderr,
            )
            raise SystemExit(2)
except SystemExit:
    raise
except Exception:
    pass
