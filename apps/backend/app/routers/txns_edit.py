from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from uuid import uuid4
from decimal import Decimal, ROUND_HALF_UP
from datetime import datetime
from app.utils.time import utc_now
from typing import Optional

from app.db import get_db
from app.orm_models import Transaction
from app.schemas.txns_edit import (
    TxnPatch,
    TxnBulkPatch,
    TxnSplitRequest,
    TxnMergeRequest,
    TxnTransferRequest,
)
from app.utils.csrf import csrf_protect


router = APIRouter(prefix="/txns/edit", tags=["transactions-edit"])


def _round2(x: Decimal) -> Decimal:
    return x.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


@router.get("", response_model=dict)
def list_txns(
    q: Optional[str] = None,
    month: Optional[str] = None,
    category: Optional[str] = None,
    merchant: Optional[str] = None,
    include_deleted: bool = False,
    limit: int = 50,
    offset: int = 0,
    sort: str = "-date",
    db: Session = Depends(get_db),
):
    qry = db.query(Transaction)
    if not include_deleted:
        qry = qry.filter(Transaction.deleted_at.is_(None))
    if month:
        qry = qry.filter(Transaction.month == month)
    if category:
        qry = qry.filter(Transaction.category == category)
    if merchant:
        qry = qry.filter(Transaction.merchant_canonical == merchant)
    if q:
        like = f"%{q.lower()}%"
        qry = qry.filter(Transaction.description.ilike(like) | Transaction.merchant_canonical.ilike(like))

    desc = sort.startswith("-")
    field = sort[1:] if desc else sort
    col = getattr(Transaction, field, Transaction.date)
    qry = qry.order_by(col.desc() if desc else col.asc())
    total = qry.count()
    rows = qry.limit(limit).offset(offset).all()
    return {
        "items": [
            {
                "id": r.id,
                "date": r.date.isoformat() if r.date else None,
                "merchant": r.merchant,
                "description": r.description,
                "amount": float(r.amount),
                "category": r.category,
                "account": r.account,
                "month": r.month,
                "note": r.note,
                "split_parent_id": r.split_parent_id,
                "transfer_group": r.transfer_group,
                "deleted_at": r.deleted_at.isoformat() if r.deleted_at else None,
            }
            for r in rows
        ],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.get("/{id}", response_model=dict)
def get_txn(id: int, db: Session = Depends(get_db)):
    t = db.get(Transaction, id)
    if not t:
        raise HTTPException(404, "Not found")
    return {
        "id": t.id,
        "date": t.date.isoformat() if t.date else None,
        "merchant": t.merchant,
        "description": t.description,
        "amount": float(t.amount),
        "category": t.category,
        "account": t.account,
        "month": t.month,
        "note": t.note,
        "split_parent_id": t.split_parent_id,
        "transfer_group": t.transfer_group,
        "deleted_at": t.deleted_at.isoformat() if t.deleted_at else None,
    }


@router.patch("/{id}", dependencies=[Depends(csrf_protect)])
def patch_txn(id: int, payload: TxnPatch, db: Session = Depends(get_db)):
    t = db.get(Transaction, id)
    if not t or t.deleted_at:
        raise HTTPException(404, "Not found")
    for k, v in payload.model_dump(exclude_none=True).items():
        if k == "merchant_raw":
            setattr(t, "merchant", v)
        elif k == "amount":
            try:
                setattr(t, k, Decimal(str(v)))
            except Exception:
                raise HTTPException(400, "Invalid amount")
        else:
            setattr(t, k, v)
    db.commit()
    return {"ok": True, "id": id}


@router.post("/bulk", dependencies=[Depends(csrf_protect)])
def bulk_patch(payload: TxnBulkPatch, db: Session = Depends(get_db)):
    updated = 0
    for id in payload.ids:
        t = db.get(Transaction, id)
        if not t or t.deleted_at:
            continue
        for k, v in payload.patch.model_dump(exclude_none=True).items():
            if k == "merchant_raw":
                setattr(t, "merchant", v)
            elif k == "amount":
                try:
                    setattr(t, k, Decimal(str(v)))
                except Exception:
                    continue
            else:
                setattr(t, k, v)
        updated += 1
    db.commit()
    return {"ok": True, "updated": updated}


@router.delete("/{id}", dependencies=[Depends(csrf_protect)])
def soft_delete(id: int, db: Session = Depends(get_db)):
    t = db.get(Transaction, id)
    if not t or t.deleted_at:
        raise HTTPException(404, "Not found")
    t.deleted_at = utc_now()
    db.commit()
    return {"ok": True}


@router.post("/{id}/restore", dependencies=[Depends(csrf_protect)])
def restore(id: int, db: Session = Depends(get_db)):
    t = db.get(Transaction, id)
    if not t or not t.deleted_at:
        raise HTTPException(404, "Not found or not deleted")
    t.deleted_at = None
    db.commit()
    return {"ok": True}


@router.post("/{id}/split", dependencies=[Depends(csrf_protect)])
def split_txn(id: int, payload: TxnSplitRequest, db: Session = Depends(get_db)):
    t = db.get(Transaction, id)
    if not t or t.deleted_at:
        raise HTTPException(404, "Not found")
    total = sum([Decimal(str(p.amount)) for p in payload.parts], Decimal("0.00"))
    if _round2(total) != _round2(Decimal(str(t.amount))):
        raise HTTPException(400, "Split parts must sum to original amount")
    # mark parent and zero amount (informational parent)
    t.split_parent_id = t.id
    t.amount = Decimal("0.00")
    from app.orm_models import Transaction as TxnORM
    for part in payload.parts:
        child = TxnORM(
            date=t.date,
            month=t.month,
            merchant=t.merchant,
            amount=Decimal(str(part.amount)),
            category=part.category or t.category,
            description=t.description,
            note=part.note,
            split_parent_id=t.id,
        )
        db.add(child)
    db.commit()
    return {"ok": True}


@router.post("/merge", dependencies=[Depends(csrf_protect)])
def merge_txns(payload: TxnMergeRequest, db: Session = Depends(get_db)):
    if len(payload.ids) < 2:
        raise HTTPException(400, "Need at least 2 ids")
    rows = db.query(Transaction).filter(Transaction.id.in_(payload.ids)).all()
    if len(rows) != len(payload.ids):
        raise HTTPException(404, "Some ids not found")
    amt = sum([Decimal(str(r.amount)) for r in rows], Decimal("0.00"))
    date = min([r.date for r in rows])
    month = min([r.month for r in rows])
    merchant = rows[0].merchant
    from app.orm_models import Transaction as TxnORM
    merged = TxnORM(
        date=date,
        month=month,
        merchant=merchant,
        amount=_round2(amt),
        category=rows[0].category,
        description=rows[0].description,
        note=payload.merged_note,
    )
    db.add(merged)
    for r in rows:
        r.deleted_at = utc_now()
    db.commit()
    db.refresh(merged)
    return {"ok": True, "id": merged.id}


@router.post("/{id}/transfer", dependencies=[Depends(csrf_protect)])
def link_transfer(id: int, payload: TxnTransferRequest, db: Session = Depends(get_db)):
    a = db.get(Transaction, id)
    b = db.get(Transaction, payload.counterpart_id)
    if not a or not b:
        raise HTTPException(404, "Not found")
    group = payload.group or str(uuid4())
    a.transfer_group = group
    b.transfer_group = group
    db.commit()
    return {"ok": True, "group": group}
