from __future__ import annotations
from typing import Optional, Annotated, List
from pydantic import BaseModel, Field, ConfigDict

# Strict "YYYY-MM" month string (set to Optional[str] if you prefer no regex)
MonthStr = Annotated[str, Field(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")]


class RuleWhen(BaseModel):
    description_like: Optional[str] = None


class RuleThen(BaseModel):
    category: str


class RuleInput(BaseModel):
    # keep it simple to avoid schema-generation surprises
    model_config = ConfigDict(from_attributes=True)
    name: Optional[str] = None
    when: Optional[RuleWhen] = None
    then: RuleThen


class SaveTrainPayload(BaseModel):
    rule: RuleInput
    month: Optional[MonthStr] = None  # e.g., "2025-09"


class SaveTrainResponse(BaseModel):
    model_config = ConfigDict(serialize_defaults=False, extra="ignore")
    rule_id: str
    reclassified: int


class RuleCreateResponse(BaseModel):
    id: str
    display_name: str


class RuleListItem(BaseModel):
    # Support string IDs for virtual items (e.g., "budget:Groceries")
    id: str | int
    display_name: str
    # Optional extra fields to annotate special kinds like budgets
    kind: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    active: Optional[bool] = True


class RuleListResponse(BaseModel):
    items: List[RuleListItem]
    total: int
    limit: int
    offset: int


class RuleTestPayload(BaseModel):
    rule: RuleInput
    month: Optional[MonthStr] = None

class TransactionSample(BaseModel):
    id: int
    merchant: Optional[str] = None
    description: Optional[str] = None
    date: Optional[str] = None  # ISO yyyy-mm-dd


class RuleTestResponse(BaseModel):
    count: int
    sample: List[TransactionSample]
