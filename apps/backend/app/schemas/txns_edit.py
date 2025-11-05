from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List


class TxnPatch(BaseModel):
    # NOTE: We intentionally accept date as a raw ISO string due to a Python 3.13
    # + pydantic 2.11.x interaction that raised PydanticSchemaGenerationError for
    # Optional[date]. The route converts this string to a date instance.
    # When upstream fixes the issue we can revert to Optional[date].
    date: Optional[str] = None
    merchant_raw: Optional[str] = Field(None, max_length=255)
    description: Optional[str] = Field(None, max_length=1024)
    note: Optional[str] = Field(None, max_length=1024)
    category: Optional[str] = Field(None, max_length=64)
    amount: Optional[str] = None  # accept string; server will coerce


class TxnBulkPatch(BaseModel):
    ids: List[int]
    patch: TxnPatch


class TxnSplitPart(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)
    amount: str  # accept string; server will coerce
    category: Optional[str] = None
    note: Optional[str] = None


class TxnSplitRequest(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)
    parts: List[TxnSplitPart]  # sums must equal original amount (within 0.01)


class TxnMergeRequest(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)
    ids: List[int]  # must share date +/-1d and merchant_canonical or explicit override
    merged_note: Optional[str] = None


class TxnTransferRequest(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)
    counterpart_id: int
    group: Optional[str] = None  # if empty, backend generates UUID


class TxnListQuery(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)
    q: Optional[str] = None
    month: Optional[str] = None
    category: Optional[str] = None
    merchant: Optional[str] = None
    include_deleted: bool = False
    limit: int = 50
    offset: int = 0
    sort: Optional[str] = "-date"  # field or -field
