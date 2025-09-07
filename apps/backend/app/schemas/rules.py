from __future__ import annotations
from typing import Optional, Annotated
from pydantic import BaseModel, Field, ConfigDict

# Strict "YYYY-MM" month string (set to Optional[str] if you prefer no regex)
MonthStr = Annotated[str, Field(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")]


class RuleWhen(BaseModel):
    description_like: Optional[str] = None


class RuleThen(BaseModel):
    category: str = Field(..., min_length=1)


class RuleInput(BaseModel):
    model_config = ConfigDict(
        from_attributes=True,  # allows ORM -> Pydantic
        json_schema_extra={
            "examples": [{
                "name": "NETFLIX → Subscriptions",
                "when": {"description_like": "NETFLIX"},
                "then": {"category": "Subscriptions"}
            }]
        }
    )
    name: Optional[str] = None
    when: Optional[RuleWhen] = None
    then: RuleThen


class SaveTrainPayload(BaseModel):
    model_config = ConfigDict(json_schema_extra={
        "examples": [{
            "rule": {
                "name": "NETFLIX → Subscriptions",
                "when": {"description_like": "NETFLIX"},
                "then": {"category": "Subscriptions"}
            },
            "month": "2025-09"
        }]
    })
    rule: RuleInput
    month: Optional[MonthStr] = None  # e.g., "2025-09"


class SaveTrainResponse(BaseModel):
    model_config = ConfigDict(json_schema_extra={
        "examples": [{
            "rule_id": "123",
            "display_name": "NETFLIX → Subscriptions",
            "reclassified": 7
        }]
    })
    rule_id: str
    display_name: str
    reclassified: int = 0


class RuleCreateResponse(BaseModel):
    model_config = ConfigDict(json_schema_extra={
        "examples": [{
            "id": "124",
            "display_name": "STARBUCKS → Coffee"
        }]
    })
    id: str
    display_name: str


class RuleListItem(BaseModel):
    model_config = ConfigDict(json_schema_extra={
        "examples": [{
            "id": 124,
            "display_name": "STARBUCKS → Coffee",
            "category": "Coffee",
            "active": True
        }]
    })
    id: int
    display_name: str
    category: Optional[str] = None
    active: Optional[bool] = True


class RuleListResponse(BaseModel):
    items: list[RuleListItem]
    total: int
    limit: int
    offset: int


class RuleTestPayload(BaseModel):
    model_config = ConfigDict(json_schema_extra={
        "examples": [{
            "rule": {
                "name": "NETFLIX → Subscriptions",
                "when": {"description_like": "NETFLIX"},
                "then": {"category": "Subscriptions"}
            },
            "month": "2025-08"
        }]
    })
    rule: RuleInput
    month: Optional[MonthStr] = None


class RuleTestResponse(BaseModel):
    model_config = ConfigDict(json_schema_extra={
        "examples": [{
            "count": 3,
            "sample": [
                {"id": 101, "merchant": "NETFLIX", "description": "NETFLIX.COM", "date": "2025-08-14"},
                {"id": 214, "merchant": "NETFLIX", "description": "NETFLIX P0123", "date": "2025-08-27"}
            ]
        }]
    })
    count: int
    sample: list[dict]
