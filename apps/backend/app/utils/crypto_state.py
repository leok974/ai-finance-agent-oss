from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from app.services.crypto import EnvelopeCrypto


@dataclass
class CryptoState:
    crypto: EnvelopeCrypto | None = None
    active_label: str = "active"


state = CryptoState()
