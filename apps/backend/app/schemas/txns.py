"""Pydantic schemas used by transaction-related routers."""

from pydantic import BaseModel


class Txn(BaseModel):
    id: int
    date: str  # YYYY-MM-DD
    merchant: str
    description: str = ""
    amount: float
    category: str = "Unknown"


class CategorizeRequest(BaseModel):
    category: str


__all__ = ["Txn", "CategorizeRequest"]
