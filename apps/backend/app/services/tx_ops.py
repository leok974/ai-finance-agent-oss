from decimal import Decimal
from sqlalchemy.orm import Session
from app.transactions import Transaction
from app.orm_models import TransferLink, TransactionSplit

def link_transfer(db: Session, txn_out_id: int, txn_in_id: int) -> TransferLink:
    out = db.query(Transaction).get(txn_out_id)
    inc = db.query(Transaction).get(txn_in_id)
    if not out or not inc:
        raise ValueError("Transaction not found")
    # sanity: opposite signs and close absolute amounts
    if (out.amount is None) or (inc.amount is None):
        raise ValueError("Amounts required")
    if (Decimal(out.amount) >= 0) or (Decimal(inc.amount) <= 0):
        # convention: outflow negative, inflow positive
        pass  # allow manual override; or enforce if you prefer

    existing = (
        db.query(TransferLink)
        .filter(TransferLink.txn_out_id == txn_out_id, TransferLink.txn_in_id == txn_in_id)
        .first()
    )
    if existing:
        return existing
    link = TransferLink(txn_out_id=txn_out_id, txn_in_id=txn_in_id)
    db.add(link)
    db.commit()
    db.refresh(link)
    return link

def unlink_transfer(db: Session, link_id: int) -> None:
    link = db.query(TransferLink).get(link_id)
    if link:
        db.delete(link)
        db.commit()

def upsert_splits(db: Session, parent_txn_id: int, splits: list[dict]) -> list[TransactionSplit]:
    parent = db.query(Transaction).get(parent_txn_id)
    if not parent:
        raise ValueError("Parent transaction not found")
    # delete existing splits for idempotency
    db.query(TransactionSplit).filter(TransactionSplit.parent_txn_id == parent_txn_id).delete()
    out = []
    for s in splits:
        cat = (s.get("category") or "").strip()
        amt = Decimal(str(s.get("amount")))
        note = (s.get("note") or "").strip() or None
        if not cat:
            raise ValueError("Split category required")
        leg = TransactionSplit(parent_txn_id=parent_txn_id, category=cat, amount=amt, note=note)
        db.add(leg)
        out.append(leg)
    db.commit()
    # refresh
    for leg in out:
        db.refresh(leg)
    return out
