from app.db import sessionmaker, engine, SessionLocal
from app.orm_models import User
from app.utils.auth import hash_password, _ensure_roles

# Provide a simple session_scope compatible helper
from contextlib import contextmanager

@contextmanager
def session_scope():
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()

def main():
    email = "admin@local"
    pw = "admin123"
    with session_scope() as db:
        u = db.query(User).filter(User.email == email).first()
        if not u:
            u = User(email=email, password_hash=hash_password(pw))
            db.add(u); db.commit(); db.refresh(u)
        _ensure_roles(db, u, ["admin", "analyst", "user"])
        print(f"Seeded admin: {email} / {pw}")

if __name__ == "__main__":
    main()
