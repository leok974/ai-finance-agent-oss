"""Seed demo account with 6 months of realistic transaction data."""
import asyncio
import random
from datetime import date, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db, SessionLocal
from app.orm_models import User, Transaction
from app.config import settings


def month_iter(end: date, months_back: int):
    """Iterate backwards through months from end date."""
    year = end.year
    month = end.month
    for _ in range(months_back):
        yield year, month
        month -= 1
        if month == 0:
            month = 12
            year -= 1


def get_or_create_demo_user(db: Session) -> User:
    """Get or create demo user."""
    user = db.query(User).filter(User.email == settings.DEMO_USER_EMAIL).first()
    if user:
        return user

    user = User(
        email=settings.DEMO_USER_EMAIL,
        name=settings.DEMO_USER_NAME,
        is_demo=True,
        is_active=True,
        password_hash="",  # No password for demo
        created_at=datetime.now(),  # SQLite doesn't support func.now()
    )
    db.add(user)
    db.flush()
    return user


def gen_month_transactions(year: int, month: int, base_seed: int):
    """
    Generate deterministic realistic transactions for a month.
    
    Includes:
    - Rent (1x)
    - Groceries (4x)
    - Restaurants (4x)
    - Gas (2x)
    - Utilities (2x)
    - Subscriptions (Netflix, Spotify, Adobe, AWS)
    - Ride shares (3x)
    - Income (2x paychecks)
    - One anomaly spike
    """
    rnd = random.Random(base_seed + year * 100 + month)

    def d(day: int):
        """Helper to create date, clamping to valid day."""
        return date(year, month, min(day, 28))

    txns = []

    # Rent
    txns.append(
        dict(
            date=d(1),
            merchant="SUNNYVIEW APARTMENTS",
            description=f"RENT {month:02d}/{year}",
            amount=-1850.00,
            category="rent",
        )
    )

    # Groceries (4 weekends)
    for week in [3, 10, 17, 24]:
        amt = rnd.uniform(80, 140)
        store = rnd.choice(["HARRIS TEETER #123", "WHOLEFDS MARKET", "TARGET #4432"])
        txns.append(
            dict(
                date=d(week),
                merchant=store,
                description="GROCERY PURCHASE",
                amount=-round(amt, 2),
                category="groceries",
            )
        )

    # Restaurants (varied)
    for week in [5, 12, 19, 26]:
        amt = rnd.uniform(18, 45)
        spot = rnd.choice(["STARBUCKS", "CHIPOTLE", "TACO BELL", "PANDA EXPRESS"])
        txns.append(
            dict(
                date=d(week),
                merchant=spot,
                description="DINING",
                amount=-round(amt, 2),
                category="restaurant",
            )
        )

    # Gas (2x per month)
    for week in [7, 21]:
        amt = rnd.uniform(35, 70)
        txns.append(
            dict(
                date=d(week),
                merchant="SHELL OIL #5678",
                description="FUEL",
                amount=-round(amt, 2),
                category="transport_gas",
            )
        )

    # Utilities
    txns.append(
        dict(
            date=d(9),
            merchant="CITY POWER & LIGHT",
            description="ELECTRIC BILL",
            amount=-round(rnd.uniform(75, 140), 2),
            category="utilities_electric",
        )
    )
    txns.append(
        dict(
            date=d(15),
            merchant="XFINITY INTERNET",
            description="INTERNET",
            amount=-79.99,
            category="utilities_internet",
        )
    )

    # Subscriptions (recurring monthly)
    txns.extend(
        [
            dict(
                date=d(13),
                merchant="NETFLIX.COM",
                description="NETFLIX SUBSCRIPTION",
                amount=-15.99,
                category="subscriptions_digital",
            ),
            dict(
                date=d(14),
                merchant="SPOTIFY",
                description="SPOTIFY PREMIUM",
                amount=-10.99,
                category="subscriptions_music",
            ),
            dict(
                date=d(16),
                merchant="ADOBE CREATIVE CLOUD",
                description="ADOBE CC",
                amount=-54.99,
                category="subscriptions_software",
            ),
            dict(
                date=d(20),
                merchant="AWS CLOUD",
                description="AWS BILLING",
                amount=-round(rnd.uniform(30, 80), 2),
                category="saas_infra",
            ),
        ]
    )

    # Ride shares (3x per month)
    for _ in range(3):
        amt = rnd.uniform(12, 28)
        txns.append(
            dict(
                date=d(rnd.randint(2, 27)),
                merchant=rnd.choice(["UBER TRIP", "LYFT RIDE"]),
                description="RIDE SHARE",
                amount=-round(amt, 2),
                category="ride_share",
            )
        )

    # Income (2 paychecks per month)
    for day in [1, 15]:
        txns.append(
            dict(
                date=d(day),
                merchant="ACME CORP PAYROLL",
                description="DIRECT DEP",
                amount=1750.00,
                category="income_salary",
            )
        )

    # One anomaly spike each month
    txns.append(
        dict(
            date=d(23),
            merchant="BEST BUY #334",
            description="ELECTRONICS PURCHASE",
            amount=-round(rnd.uniform(400, 900), 2),
            category="shopping_electronics",
        )
    )

    return txns


def seed_demo_data():
    """Main seeding function."""
    today = date.today()
    db = SessionLocal()

    try:
        user = get_or_create_demo_user(db)

        # Wipe old demo transactions for idempotency
        db.query(Transaction).filter(Transaction.user_id == user.id).delete()

        all_txns = []
        for i, (y, m) in enumerate(month_iter(today, months_back=6)):
            all_txns.extend(gen_month_transactions(y, m, base_seed=42 + i))

        # Add all transactions
        for t in all_txns:
            txn = Transaction(
                user_id=user.id,
                date=t["date"],
                merchant=t["merchant"],
                description=t["description"],
                amount=t["amount"],
                category=t["category"],
                pending=False,
            )
            db.add(txn)

        db.commit()
        print(
            f"✅ Seeded demo data: {len(all_txns)} transactions for {settings.DEMO_USER_EMAIL}"
        )

    except Exception as e:
        db.rollback()
        print(f"❌ Error seeding demo data: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed_demo_data()
