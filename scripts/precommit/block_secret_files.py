"""Pre-commit hook that blocks committing known secret artifacts."""

from __future__ import annotations

import re
import sys
from pathlib import Path


PATTERNS = (
    re.compile(r"(^|[\\/])active-dek.*\.json$", re.IGNORECASE),
    re.compile(r"(^|[\\/]).*\.dek\.json$", re.IGNORECASE),
    re.compile(r"(^|[\\/]).*\.sa\.json$", re.IGNORECASE),
)


def main(argv: list[str]) -> int:
    blocked: list[str] = []
    for raw_path in argv:
        normalized = Path(raw_path).as_posix()
        if any(pattern.search(normalized) for pattern in PATTERNS):
            blocked.append(raw_path)

    if blocked:
        print(
            "Refusing to commit files that look like wrapped keys or service account credentials:",
            file=sys.stderr,
        )
        for entry in blocked:
            print(f"  - {entry}", file=sys.stderr)
        print(
            "Move them to a secrets location or ensure they stay ignored.",
            file=sys.stderr,
        )
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
