from app.db import SessionLocal
from app.orm_models import Transaction
s = SessionLocal()
rows = (s.query(Transaction).order_by(Transaction.date.desc()).limit(5).all())
for t in rows:
    print(t.id, '|', (t.merchant or ''), '|', (t.category or ''), '|', t.date, '|', t.amount)
s.close()
