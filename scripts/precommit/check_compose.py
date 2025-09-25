"""Pre-commit hook that validates docker compose files via `docker compose config`."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path
from shutil import which


COMPOSE_FILE_GROUPS: list[list[str]] = [
    ["docker-compose.yml"],
    ["docker-compose.dev.yml"],
    ["docker-compose.prod.yml", "docker-compose.prod.override.yml"],
]


def _compose_command() -> list[str]:
    """Return the preferred compose command invocation."""

    candidates: list[list[str]] = [["docker", "compose"], ["docker-compose"]]
    for candidate in candidates:
        executable = candidate[0]
        if which(executable) is None:
            continue
        try:
            subprocess.run(
                candidate + ["version"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                check=True,
            )
            return candidate
        except (subprocess.CalledProcessError, FileNotFoundError):
            continue
    raise SystemExit(
        "docker compose command not available. Install Docker Compose v2 (docker compose) or docker-compose."
    )


def _run_config(compose_cmd: list[str], files: list[str]) -> None:
    args: list[str] = []
    for fname in files:
        args.extend(["-f", fname])
    args.append("config")

    proc = subprocess.run(
        compose_cmd + args,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    if proc.returncode != 0:
        file_display = " + ".join(files)
        output = proc.stderr.strip() or proc.stdout.strip() or "unknown error"
        raise SystemExit(f"docker compose config failed for {file_display}:\n{output}")


def main(argv: list[str]) -> int:
    compose_cmd = _compose_command()
    repo_root = Path.cwd()

    any_ran = False
    for group in COMPOSE_FILE_GROUPS:
        if not all((repo_root / name).exists() for name in group):
            continue
        _run_config(compose_cmd, group)
        any_ran = True

    if not any_ran:
        # Nothing to check (e.g., repository without compose files).
        return 0
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
