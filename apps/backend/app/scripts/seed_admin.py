import argparse
import os
from contextlib import contextmanager

from app.db import SessionLocal
from app.orm_models import User
from app.utils.auth import hash_password, _ensure_roles


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


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Seed or update an admin user.")
    parser.add_argument(
        "--email",
        default=os.getenv("ADMIN_EMAIL", "admin@local"),
        help="Email of the account to seed/update",
    )
    parser.add_argument(
        "--password",
        default=os.getenv("ADMIN_PASSWORD", "admin123"),
        help="Password to set for the account",
    )
    parser.add_argument(
        "--roles",
        default=os.getenv("ADMIN_ROLES", "admin,analyst,user"),
        help="Comma-separated list of roles to ensure for the account",
    )
    return parser.parse_args()


def main():
    args = parse_args()
    email = args.email.strip()
    pw = args.password
    roles = [r.strip() for r in args.roles.split(",") if r.strip()]

    if not email:
        raise SystemExit("Email must not be empty")
    if not pw:
        raise SystemExit("Password must not be empty")
    if not roles:
        raise SystemExit("At least one role is required")

    with session_scope() as db:
        u = db.query(User).filter(User.email == email).first()
        if not u:
            u = User(email=email, password_hash=hash_password(pw))
            db.add(u)
            db.commit()
            db.refresh(u)
            created = True
        else:
            u.password_hash = hash_password(pw)
            created = False
        _ensure_roles(db, u, roles)
        db.flush()
        action = "Created" if created else "Updated"
        print(
            f"{action} admin user: {email} (roles={roles}, password length={len(pw)})"
        )


if __name__ == "__main__":
    main()
