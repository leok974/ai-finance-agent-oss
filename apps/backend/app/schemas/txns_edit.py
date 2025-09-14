from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import date as _date


class TxnPatch(BaseModel):
    date: Optional[_date] = None
    merchant_raw: Optional[str] = Field(None, max_length=255)
    description: Optional[str] = Field(None, max_length=1024)
    note: Optional[str] = Field(None, max_length=1024)
    category: Optional[str] = Field(None, max_length=64)
    amount: Optional[str] = None  # accept string; server will coerce


class TxnBulkPatch(BaseModel):
    ids: List[int]
    patch: TxnPatch


class TxnSplitPart(BaseModel):
    amount: str  # accept string; server will coerce
    category: Optional[str] = None
    note: Optional[str] = None


class TxnSplitRequest(BaseModel):
    parts: List[TxnSplitPart]  # sums must equal original amount (within 0.01)


class TxnMergeRequest(BaseModel):
    ids: List[int]  # must share date +/-1d and merchant_canonical or explicit override
    merged_note: Optional[str] = None


class TxnTransferRequest(BaseModel):
    counterpart_id: int
    group: Optional[str] = None  # if empty, backend generates UUID


class TxnListQuery(BaseModel):
    q: Optional[str] = None
    month: Optional[str] = None
    category: Optional[str] = None
    merchant: Optional[str] = None
    include_deleted: bool = False
    limit: int = 50
    offset: int = 0
    sort: Optional[str] = "-date"  # field or -field
