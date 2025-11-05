#!/usr/bin/env python3
"""
CLI utility to seed/update a dev superuser with admin role.
Only runs in dev mode (APP_ENV=dev). Never run this in production.

Usage:
    python -m app.cli_seed_dev_user <email> <password>

Example:
    $env:APP_ENV='dev'
    $env:DEV_SUPERUSER_EMAIL='leoklemet.pa@gmail.com'
    python -m app.cli_seed_dev_user leoklemet.pa@gmail.com Superleo3
"""
import sys
import os

# Ensure we're in dev mode before proceeding
if __name__ == "__main__":
    app_env = os.getenv("APP_ENV", os.getenv("ENV", "dev"))
    if app_env not in ("dev", "test"):
        print(
            f"ERROR: This script only runs in dev/test mode. Current APP_ENV={app_env}"
        )
        sys.exit(1)

from app.config import settings
from app.db import SessionLocal
from app.orm_models import User, Role, UserRole
from app.utils.auth import hash_password


def seed_dev_user(email: str, password: str) -> None:
    """
    Create or update a dev user with admin role and hashed password.

    Args:
        email: User email address
        password: Plain text password (will be hashed)
    """
    # Safety check: only allow in dev/test mode
    if settings.APP_ENV not in ("dev", "test") and settings.ENV not in ("dev", "test"):
        raise RuntimeError(
            f"Only allowed in dev/test mode. Current: APP_ENV={settings.APP_ENV}, ENV={settings.ENV}"
        )

    with SessionLocal() as db:
        # Find or create user
        user = db.query(User).filter(User.email == email).one_or_none()
        if not user:
            # Hash password BEFORE creating user (password_hash is NOT NULL)
            hashed_pwd = hash_password(password)
            user = User(email=email, password_hash=hashed_pwd, is_active=True)
            db.add(user)
            db.flush()  # Get user ID
            print(f"[OK] Created new user: {email}")
        else:
            print(f"[INFO] Found existing user: {email}")
            # Update password for existing user
            user.password_hash = hash_password(password)

        # Ensure admin role exists
        admin_role = db.query(Role).filter(Role.name == "admin").one_or_none()
        if not admin_role:
            admin_role = Role(name="admin")
            db.add(admin_role)
            db.flush()
            print("[OK] Created 'admin' role")

        # Check if user already has admin role
        existing_mapping = (
            db.query(UserRole)
            .filter(UserRole.user_id == user.id, UserRole.role_id == admin_role.id)
            .one_or_none()
        )

        if not existing_mapping:
            user_role = UserRole(user_id=user.id, role_id=admin_role.id)
            db.add(user_role)
            print(f"[OK] Granted 'admin' role to {email}")
        else:
            print("[INFO] User already has 'admin' role")

        db.commit()
        print("\n[OK] Dev superuser ready:")
        print(f"   Email: {email}")
        print(f"   Password: {'*' * len(password)} (hashed in DB)")
        print("   Roles: admin")
        print("\nTo enable dev_unlocked, set environment variable:")
        print(f"   DEV_SUPERUSER_EMAIL={email}")


def main():
    if len(sys.argv) != 3:
        print(__doc__)
        print("\nERROR: Expected 2 arguments: <email> <password>")
        sys.exit(1)

    email = sys.argv[1]
    password = sys.argv[2]

    # Validate email format
    if "@" not in email or "." not in email:
        print(f"ERROR: Invalid email format: {email}")
        sys.exit(1)

    # Warn about password security
    if len(password) < 6:
        print("WARNING: Password is very short. Consider using a stronger password.")

    try:
        seed_dev_user(email, password)
    except Exception as e:
        print(f"\n[ERROR] Error seeding dev user: {e}")
        import traceback

        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
