# apps/backend/app/schemas.py
from pydantic import BaseModel, ConfigDict
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

    model_config = ConfigDict(from_attributes=True)

class RuleIn(BaseModel):
    pattern: str
    target: str = "description"
    category: str
