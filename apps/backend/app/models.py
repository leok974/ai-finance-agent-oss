from pydantic import BaseModel
from typing import List, Optional, Literal, Dict

class Txn(BaseModel):
    id: int
    date: str          # YYYY-MM-DD
    merchant: str
    description: str = ""
    amount: float
    category: str = "Unknown"

class Rule(BaseModel):
    pattern: str
    target: Literal["merchant","description"]
    category: str

class Suggestion(BaseModel):
    txn_id: int
    suggestions: List[Dict]  # [{category, confidence, rationale?}]

class ChatMessage(BaseModel):
    role: Literal["user","assistant","system"]
    content: str

class ChatRequest(BaseModel):
    messages: List[ChatMessage]
    context: Optional[Dict] = None

class CategorizeRequest(BaseModel):
    category: str
