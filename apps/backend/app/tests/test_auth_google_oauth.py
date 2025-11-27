"""
OAuth Google authentication tests.

Tests the complete OAuth flow including:
- Existing OAuthAccount reuse
- OAuth linking to existing users
- New user creation via OAuth
- Demo user protection
"""

import pytest
import asyncio
from unittest.mock import Mock, AsyncMock, patch
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from app.orm_models import User, UserRole, Role, OAuthAccount
from app.db import Base
from app.auth.google import callback
from fastapi import HTTPException, Request
from starlette.datastructures import QueryParams

# Use in-memory SQLite for tests
TEST_DATABASE_URL = "sqlite:///:memory:"


@pytest.fixture(scope="function")
def db_session():
    """Create a fresh database session for each test."""
    engine = create_engine(TEST_DATABASE_URL, connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    SessionLocal = sessionmaker(bind=engine)
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)


@pytest.fixture
def mock_db(db_session: Session):
    """Database session fixture."""
    return db_session


def async_run(coro):
    """Helper to run async functions in sync tests."""
    loop = asyncio.get_event_loop()
    return loop.run_until_complete(coro)


@pytest.fixture
def mock_request():
    """Mock Starlette request with session support."""
    request = Mock(spec=Request)
    request.session = {}
    request.query_params = QueryParams({})
    request.cookies = {}
    return request


@pytest.fixture
def mock_oauth_token():
    """Mock OAuth token response."""
    return {
        "access_token": "mock_access_token",
        "id_token": "mock_id_token",
        "token_type": "Bearer",
        "expires_in": 3600,
    }


@pytest.fixture
def mock_userinfo():
    """Mock Google userinfo response."""
    return {
        "sub": "google-sub-12345",
        "email": "test@gmail.com",
        "name": "Test User",
        "picture": "https://example.com/picture.jpg",
    }


class TestOAuthExistingAccount:
    """Test OAuth flow when OAuthAccount already exists."""

    def test_existing_oauth_account_reuses_user(
        self, mock_db, mock_request, mock_oauth_token, mock_userinfo
    ):
        """
        Given: Existing user with linked OAuthAccount
        When: OAuth callback with same Google sub
        Then: Reuse existing user, no new records created
        """
        # Setup: Create existing user with OAuth account
        user = User(
            email="test@gmail.com",
            password_hash="",
            is_active=True,
            name="Test User",
            picture="https://example.com/picture.jpg",
        )
        mock_db.add(user)
        mock_db.flush()

        oauth_account = OAuthAccount(
            user_id=user.id,
            provider="google",
            provider_user_id="google-sub-12345",
            email="test@gmail.com",
        )
        mock_db.add(oauth_account)
        mock_db.commit()

        initial_user_count = mock_db.query(User).count()
        initial_oauth_count = mock_db.query(OAuthAccount).count()

        # Mock OAuth state/PKCE verification
        mock_request.session = {
            "oauth_state": "test_state",
            "oauth_pkce_verifier": "test_verifier",
        }
        mock_request.query_params = QueryParams({"state": "test_state"})

        # Mock OAuth exchange and userinfo
        with patch("app.auth.google.oauth.google") as mock_google:
            mock_google.authorize_access_token = AsyncMock(
                return_value=mock_oauth_token
            )
            mock_google.parse_id_token = AsyncMock(return_value=mock_userinfo)

            # Execute callback
            async_run(callback(mock_request, db=mock_db))

        # Verify: No new users or OAuth accounts created
        assert mock_db.query(User).count() == initial_user_count
        assert mock_db.query(OAuthAccount).count() == initial_oauth_count

        # Verify: User is still the same
        db_user = (
            mock_db.query(User).filter(User.email == "test@gmail.com").first()
        )  # type: ignore
        assert db_user.id == user.id

    def test_oauth_account_updates_user_profile(
        self, mock_db, mock_request, mock_oauth_token
    ):
        """
        Given: Existing user with OAuth account
        When: OAuth callback with updated name/picture
        Then: User profile is updated
        """
        # Setup: Create existing user
        user = User(
            email="test@gmail.com",
            password_hash="",
            is_active=True,
            name="Old Name",
            picture="https://example.com/old.jpg",
        )
        mock_db.add(user)
        mock_db.flush()

        oauth_account = OAuthAccount(
            user_id=user.id,
            provider="google",
            provider_user_id="google-sub-12345",
            email="test@gmail.com",
        )
        mock_db.add(oauth_account)
        mock_db.commit()

        # Mock OAuth with updated profile
        updated_userinfo = {
            "sub": "google-sub-12345",
            "email": "test@gmail.com",
            "name": "New Name",
            "picture": "https://example.com/new.jpg",
        }

        mock_request.session = {
            "oauth_state": "test_state",
            "oauth_pkce_verifier": "test_verifier",
        }
        mock_request.query_params = QueryParams({"state": "test_state"})

        with patch("app.auth.google.oauth.google") as mock_google:
            mock_google.authorize_access_token = AsyncMock(
                return_value=mock_oauth_token
            )
            mock_google.parse_id_token = AsyncMock(return_value=updated_userinfo)

            async_run(callback(mock_request, db=mock_db))

        # Verify: User profile updated
        db_user = (
            mock_db.query(User).filter(User.email == "test@gmail.com").first()
        )  # type: ignore
        assert db_user.name == "New Name"
        assert db_user.picture == "https://example.com/new.jpg"


class TestOAuthExistingUserNoAccount:
    """Test OAuth flow when user exists but no OAuthAccount."""

    def test_existing_user_gets_oauth_linked(
        self, mock_db, mock_request, mock_oauth_token, mock_userinfo
    ):
        """
        Given: Existing user (no OAuth account)
        When: OAuth callback with matching email
        Then: Create new OAuthAccount linked to existing user
        """
        # Setup: Create user without OAuth account
        user = User(
            email="test@gmail.com",
            password_hash="hashed_password",  # User has password (non-OAuth)
            is_active=True,
        )
        mock_db.add(user)
        mock_db.commit()

        initial_oauth_count = mock_db.query(OAuthAccount).count()

        mock_request.session = {
            "oauth_state": "test_state",
            "oauth_pkce_verifier": "test_verifier",
        }
        mock_request.query_params = QueryParams({"state": "test_state"})

        with patch("app.auth.google.oauth.google") as mock_google:
            mock_google.authorize_access_token = AsyncMock(
                return_value=mock_oauth_token
            )
            mock_google.parse_id_token = AsyncMock(return_value=mock_userinfo)

            async_run(callback(mock_request, db=mock_db))

        # Verify: OAuthAccount created
        assert mock_db.query(OAuthAccount).count() == initial_oauth_count + 1

        # Verify: OAuthAccount linked to existing user
        oauth_account = (
            mock_db.query(OAuthAccount)
            .filter(OAuthAccount.provider_user_id == "google-sub-12345")
            .first()
        )
        assert oauth_account is not None
        assert oauth_account.user_id == user.id
        assert oauth_account.provider == "google"

    def test_demo_user_cannot_be_linked_to_oauth(
        self, mock_db, mock_request, mock_oauth_token
    ):
        """
        Given: Demo user with is_demo=True
        When: OAuth callback with matching email
        Then: Raise HTTPException, do not link OAuth
        """
        # Setup: Create demo user
        demo_user = User(
            email="demo@ledger-mind.local",
            password_hash="demo_hash",
            is_active=True,
            is_demo=True,
            is_demo_user=True,
        )
        mock_db.add(demo_user)
        mock_db.commit()

        demo_userinfo = {
            "sub": "google-sub-demo",
            "email": "demo@ledger-mind.local",
            "name": "Demo User",
        }

        mock_request.session = {
            "oauth_state": "test_state",
            "oauth_pkce_verifier": "test_verifier",
        }
        mock_request.query_params = QueryParams({"state": "test_state"})

        with patch("app.auth.google.oauth.google") as mock_google:
            mock_google.authorize_access_token = AsyncMock(
                return_value=mock_oauth_token
            )
            mock_google.parse_id_token = AsyncMock(return_value=demo_userinfo)

            with pytest.raises(HTTPException) as exc_info:
                async_run(callback(mock_request, db=mock_db))

            assert exc_info.value.status_code == 400
            assert "demo" in exc_info.value.detail.lower()

        # Verify: No OAuth account created
        oauth_count = (
            mock_db.query(OAuthAccount)
            .filter(OAuthAccount.provider_user_id == "google-sub-demo")
            .count()
        )
        assert oauth_count == 0


class TestOAuthNewUser:
    """Test OAuth flow for new users."""

    def test_new_user_created_via_oauth(
        self, mock_db, mock_request, mock_oauth_token, mock_userinfo
    ):
        """
        Given: No existing user or OAuth account
        When: OAuth callback with new email
        Then: Create new user AND new OAuthAccount
        """
        initial_user_count = mock_db.query(User).count()
        initial_oauth_count = mock_db.query(OAuthAccount).count()

        # Ensure "user" role exists
        user_role = mock_db.query(Role).filter(Role.name == "user").first()
        if not user_role:
            user_role = Role(name="user")
            mock_db.add(user_role)
            mock_db.commit()

        mock_request.session = {
            "oauth_state": "test_state",
            "oauth_pkce_verifier": "test_verifier",
        }
        mock_request.query_params = QueryParams({"state": "test_state"})

        with patch("app.auth.google.oauth.google") as mock_google:
            mock_google.authorize_access_token = AsyncMock(
                return_value=mock_oauth_token
            )
            mock_google.parse_id_token = AsyncMock(return_value=mock_userinfo)

            async_run(callback(mock_request, db=mock_db))

        # Verify: New user created
        assert mock_db.query(User).count() == initial_user_count + 1
        new_user = (
            mock_db.query(User).filter(User.email == "test@gmail.com").first()
        )  # type: ignore
        assert new_user is not None
        assert new_user.name == "Test User"
        assert new_user.picture == "https://example.com/picture.jpg"
        assert new_user.is_demo is False
        assert new_user.password_hash == ""  # OAuth users don't have passwords

        # Verify: OAuthAccount created
        assert mock_db.query(OAuthAccount).count() == initial_oauth_count + 1
        oauth_account = (
            mock_db.query(OAuthAccount)
            .filter(OAuthAccount.provider_user_id == "google-sub-12345")
            .first()
        )
        assert oauth_account is not None
        assert oauth_account.user_id == new_user.id

        # Verify: User has default "user" role
        user_roles = (
            mock_db.query(UserRole).filter(UserRole.user_id == new_user.id).all()
        )  # type: ignore
        assert len(user_roles) > 0
        assert any(ur.role.name == "user" for ur in user_roles)


class TestOAuthStateSecurity:
    """Test OAuth state and PKCE security measures."""

    def test_state_mismatch_rejected(self, mock_db, mock_request):
        """
        Given: OAuth callback with mismatched state
        When: Callback invoked
        Then: Raise HTTPException 400
        """
        mock_request.session = {"oauth_state": "session_state"}
        mock_request.query_params = QueryParams({"state": "different_state"})

        with pytest.raises(HTTPException) as exc_info:
            async_run(callback(mock_request, db=mock_db))

        assert exc_info.value.status_code == 400
        assert "state" in exc_info.value.detail.lower()

    def test_missing_pkce_verifier_rejected(self, mock_db, mock_request):
        """
        Given: OAuth callback without PKCE verifier in session
        When: Callback invoked
        Then: Raise HTTPException 400
        """
        mock_request.session = {
            "oauth_state": "test_state"
            # Missing oauth_pkce_verifier
        }
        mock_request.query_params = QueryParams({"state": "test_state"})

        with pytest.raises(HTTPException) as exc_info:
            async_run(callback(mock_request, db=mock_db))

        assert exc_info.value.status_code == 400
        assert "pkce" in exc_info.value.detail.lower()


class TestOAuthErrorHandling:
    """Test OAuth error handling and edge cases."""

    def test_no_email_in_userinfo_rejected(
        self, mock_db, mock_request, mock_oauth_token
    ):
        """
        Given: Google userinfo without email
        When: OAuth callback
        Then: Raise HTTPException 400
        """
        userinfo_no_email = {
            "sub": "google-sub-12345",
            # Missing email
            "name": "Test User",
        }

        mock_request.session = {
            "oauth_state": "test_state",
            "oauth_pkce_verifier": "test_verifier",
        }
        mock_request.query_params = QueryParams({"state": "test_state"})

        with patch("app.auth.google.oauth.google") as mock_google:
            mock_google.authorize_access_token = AsyncMock(
                return_value=mock_oauth_token
            )
            mock_google.parse_id_token = AsyncMock(return_value=userinfo_no_email)

            with pytest.raises(HTTPException) as exc_info:
                async_run(callback(mock_request, db=mock_db))

            assert exc_info.value.status_code == 400
            assert "email" in exc_info.value.detail.lower()

    def test_no_sub_in_userinfo_rejected(self, mock_db, mock_request, mock_oauth_token):
        """
        Given: Google userinfo without sub (user ID)
        When: OAuth callback
        Then: Raise HTTPException 400
        """
        userinfo_no_sub = {
            # Missing sub
            "email": "test@gmail.com",
            "name": "Test User",
        }

        mock_request.session = {
            "oauth_state": "test_state",
            "oauth_pkce_verifier": "test_verifier",
        }
        mock_request.query_params = QueryParams({"state": "test_state"})

        with patch("app.auth.google.oauth.google") as mock_google:
            mock_google.authorize_access_token = AsyncMock(
                return_value=mock_oauth_token
            )
            mock_google.parse_id_token = AsyncMock(return_value=userinfo_no_sub)

            with pytest.raises(HTTPException) as exc_info:
                async_run(callback(mock_request, db=mock_db))

            assert exc_info.value.status_code == 400
            assert "user id" in exc_info.value.detail.lower()
