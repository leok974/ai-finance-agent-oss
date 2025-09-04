# apps/backend/app/schemas.py
from pydantic import BaseModel
from datetime import date
from typing import Optional

class TxnOut(BaseModel):
    id: int
    date: date
    merchant: Optional[str] = None
    description: Optional[str] = None
    amount: float
    category: Optional[str] = None
    account: Optional[str] = None
    month: str

    class Config:
        from_attributes = True  # Pydantic v2: allow orm_mode-like behavior

class RuleIn(BaseModel):
    pattern: str
    target: str = "description"
    category: str
