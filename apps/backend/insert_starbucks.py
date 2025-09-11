from datetime import date
from app.db import SessionLocal
from app.orm_models import Transaction
s = SessionLocal()
t = Transaction(
    date=date.today(),
    merchant='Starbucks',
    merchant_canonical='starbucks',
    amount=-4.50,
    category=None
)
s.add(t); s.commit(); s.refresh(t)
print(t.id)
s.close()
