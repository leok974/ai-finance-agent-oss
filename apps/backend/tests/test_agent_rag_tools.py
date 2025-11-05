# apps/backend/tests/test_agent_rag_tools.py
"""
Tests for RAG tools infrastructure:
- Admin-only access control
- Dev-only guard for seed action
- All RAG action executions (status, rebuild, ingest_url, bulk_ingest, ingest_pdf, seed)
"""
import pytest
from unittest.mock import Mock, patch
from fastapi import HTTPException
from app.services import rag_tools
from app.orm_models import User


@pytest.fixture
def admin_user(db):
    """Create an admin user with proper roles."""
    user = User(id=1, email="admin@test.com", password_hash="hashed")

    # Mock the roles attribute to return admin role
    mock_role = Mock()
    mock_role.name = "admin"
    user.roles = [mock_role]

    # Add dev_unlocked attribute (can be overridden in tests)
    user.dev_unlocked = False

    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture
def regular_user(db):
    """Create a regular user without admin role."""
    user = User(id=2, email="user@test.com", password_hash="hashed")

    # Mock the roles attribute to return user role
    mock_role = Mock()
    mock_role.name = "user"
    user.roles = [mock_role]

    db.add(user)
    db.commit()
    db.refresh(user)
    return user


class TestRagToolsAuth:
    """Test authentication and authorization for RAG tools."""

    def test_require_admin_dev_no_user(self):
        """Test that None user raises 401."""
        with pytest.raises(HTTPException) as exc_info:
            rag_tools._require_admin_dev(None, dev_only=False)
        assert exc_info.value.status_code == 401
        assert "Authentication required" in exc_info.value.detail

    def test_require_admin_dev_non_admin(self, regular_user):
        """Test that non-admin user raises 403."""
        with pytest.raises(HTTPException) as exc_info:
            rag_tools._require_admin_dev(regular_user, dev_only=False)
        assert exc_info.value.status_code == 403
        assert "Admin only" in exc_info.value.detail

    def test_require_admin_dev_admin_ok(self, admin_user):
        """Test that admin user passes non-dev check."""
        # Should not raise
        rag_tools._require_admin_dev(admin_user, dev_only=False)

    def test_require_admin_dev_dev_gate_disabled(self, admin_user, monkeypatch):
        """Test that dev-only action blocked when APP_ENV=prod."""
        monkeypatch.setenv("APP_ENV", "prod")
        monkeypatch.setenv("ALLOW_DEV_ROUTES", "0")

        with pytest.raises(HTTPException) as exc_info:
            rag_tools._require_admin_dev(admin_user, dev_only=True)
        assert exc_info.value.status_code == 403
        assert (
            "Dev mode disabled" in exc_info.value.detail
            or "production" in exc_info.value.detail
        )

    def test_require_admin_dev_dev_gate_enabled(self, admin_user, monkeypatch):
        """Test that dev-only action allowed when APP_ENV=dev and dev_unlocked=True."""
        monkeypatch.setenv("APP_ENV", "dev")
        admin_user.dev_unlocked = True  # Grant dev unlock via PIN
        # Should not raise
        rag_tools._require_admin_dev(admin_user, dev_only=True)

    def test_require_admin_dev_missing_dev_unlocked(self, admin_user, monkeypatch):
        """Test that dev-only action blocked when dev_unlocked=False (PIN not verified)."""
        monkeypatch.setenv("APP_ENV", "dev")
        admin_user.dev_unlocked = False  # No PIN unlock

        with pytest.raises(HTTPException) as exc_info:
            rag_tools._require_admin_dev(admin_user, dev_only=True)
        assert exc_info.value.status_code == 403
        assert (
            "Dev PIN required" in exc_info.value.detail
            or "unlock" in exc_info.value.detail
        )


class TestRagActionsRegistry:
    """Test RAG actions registry and dispatcher."""

    def test_actions_registry_complete(self):
        """Test that all expected actions are registered."""
        expected_actions = [
            "rag.status",
            "rag.rebuild",
            "rag.ingest_url",
            "rag.bulk_ingest",
            "rag.ingest_pdf",
            "rag.seed",
        ]
        for action in expected_actions:
            assert action in rag_tools.ACTIONS
            assert "handler" in rag_tools.ACTIONS[action]
            assert "dev_only" in rag_tools.ACTIONS[action]
            assert "description" in rag_tools.ACTIONS[action]

    def test_seed_is_dev_only(self):
        """Test that rag.seed is marked as dev-only."""
        assert rag_tools.ACTIONS["rag.seed"]["dev_only"] is True

    def test_other_actions_not_dev_only(self):
        """Test that non-seed actions are not dev-only."""
        non_dev_actions = [
            "rag.status",
            "rag.rebuild",
            "rag.ingest_url",
            "rag.bulk_ingest",
            "rag.ingest_pdf",
        ]
        for action in non_dev_actions:
            assert rag_tools.ACTIONS[action]["dev_only"] is False

    @pytest.mark.asyncio
    async def test_run_action_unknown_action(self, admin_user, db):
        """Test that unknown action raises 400."""
        with pytest.raises(HTTPException) as exc_info:
            await rag_tools.run_action("rag.unknown", admin_user, db)
        assert exc_info.value.status_code == 400
        assert "Unknown action" in exc_info.value.detail


class TestRagActionExecution:
    """Test execution of individual RAG actions."""

    @pytest.mark.asyncio
    async def test_rag_status(self, admin_user, db):
        """Test rag.status returns index statistics."""
        result, _ = await rag_tools.run_action("rag.status", admin_user, db)

        assert "status" in result
        assert "documents" in result
        assert "chunks" in result
        assert "vendors" in result
        assert isinstance(result["documents"], int)
        assert isinstance(result["chunks"], int)
        assert isinstance(result["vendors"], list)

    @pytest.mark.asyncio
    async def test_rag_rebuild(self, admin_user, db):
        """Test rag.rebuild clears index."""
        result, _ = await rag_tools.run_action("rag.rebuild", admin_user, db)

        assert result["status"] == "ok"
        assert "message" in result

    @pytest.mark.asyncio
    async def test_rag_ingest_url_invalid_url(self, admin_user, db):
        """Test rag.ingest_url rejects invalid URL."""
        with pytest.raises(HTTPException) as exc_info:
            await rag_tools.run_action(
                "rag.ingest_url", admin_user, db, url="not-a-url"
            )
        assert exc_info.value.status_code == 400
        assert "Invalid URL" in exc_info.value.detail

    @pytest.mark.asyncio
    @patch("app.services.rag_store.ingest_urls")
    async def test_rag_ingest_url_valid(self, mock_ingest, admin_user, db):
        """Test rag.ingest_url with valid URL."""
        mock_ingest.return_value = {
            "ok": True,
            "results": [{"url": "https://example.com", "status": "ingested"}],
        }

        result, _ = await rag_tools.run_action(
            "rag.ingest_url", admin_user, db, url="https://example.com"
        )

        assert result["ok"] is True
        mock_ingest.assert_called_once()

    @pytest.mark.asyncio
    async def test_rag_bulk_ingest_empty_list(self, admin_user, db):
        """Test rag.bulk_ingest rejects empty list."""
        with pytest.raises(HTTPException) as exc_info:
            await rag_tools.run_action("rag.bulk_ingest", admin_user, db, urls=[])
        assert exc_info.value.status_code == 400

    @pytest.mark.asyncio
    @patch("app.services.rag_store.ingest_urls")
    async def test_rag_bulk_ingest_valid(self, mock_ingest, admin_user, db):
        """Test rag.bulk_ingest with valid URLs."""
        urls = ["https://example.com", "https://test.com"]
        mock_ingest.return_value = {"ok": True, "results": []}

        result, _ = await rag_tools.run_action(
            "rag.bulk_ingest", admin_user, db, urls=urls
        )

        assert result["ok"] is True
        mock_ingest.assert_called_once_with(db, urls, force=False)

    @pytest.mark.asyncio
    @patch("app.services.rag_store.ingest_files")
    async def test_rag_ingest_pdf(self, mock_ingest, admin_user, db):
        """Test rag.ingest_pdf with valid PDF bytes."""
        mock_ingest.return_value = {
            "ok": True,
            "results": [{"file": "test.pdf", "status": "ingested", "chunks": 5}],
        }

        result, _ = await rag_tools.run_action(
            "rag.ingest_pdf",
            admin_user,
            db,
            file_bytes=b"fake-pdf-content",
            filename="test.pdf",
            vendor="TestVendor",
        )

        assert result["ok"] is True
        mock_ingest.assert_called_once()

    @pytest.mark.asyncio
    @patch("app.services.rag_store.ingest_urls")
    async def test_rag_seed_dev_enabled(self, mock_ingest, admin_user, db, monkeypatch):
        """Test rag.seed works when dev mode enabled and user has dev_unlocked (PIN verified)."""
        monkeypatch.setenv("APP_ENV", "dev")
        admin_user.dev_unlocked = True  # Grant dev unlock via PIN
        mock_ingest.return_value = {"ok": True, "results": []}

        result, _ = await rag_tools.run_action("rag.seed", admin_user, db)

        assert result["status"] == "ok"
        assert "seeded" in result
        assert result["seeded"] == 8  # 8 vendor URLs in seed list
        mock_ingest.assert_called_once()

    @pytest.mark.asyncio
    async def test_rag_seed_dev_disabled(self, admin_user, db, monkeypatch):
        """Test rag.seed blocked when dev mode disabled (production environment)."""
        monkeypatch.setenv("APP_ENV", "prod")
        monkeypatch.setenv("ALLOW_DEV_ROUTES", "0")
        admin_user.dev_unlocked = True  # Has unlock but env blocks it

        with pytest.raises(HTTPException) as exc_info:
            await rag_tools.run_action("rag.seed", admin_user, db)
        assert exc_info.value.status_code == 403
        assert (
            "Dev mode disabled" in exc_info.value.detail
            or "production" in exc_info.value.detail
        )

    @pytest.mark.asyncio
    async def test_rag_seed_missing_dev_unlocked(self, admin_user, db, monkeypatch):
        """Test rag.seed blocked when user lacks dev_unlocked (PIN not verified)."""
        monkeypatch.setenv("APP_ENV", "dev")
        admin_user.dev_unlocked = False  # Env allows but user hasn't entered PIN

        with pytest.raises(HTTPException) as exc_info:
            await rag_tools.run_action("rag.seed", admin_user, db)
        assert exc_info.value.status_code == 403
        assert (
            "Dev PIN required" in exc_info.value.detail
            or "unlock" in exc_info.value.detail
        )


class TestRagToolsRouter:
    """Test RAG tools router endpoints."""

    def test_rag_action_endpoint_no_auth(self, client):
        """Test that RAG action endpoint requires authentication."""
        response = client.post("/agent/tools/rag/rag.status", json={})
        assert response.status_code in (401, 403)

    def test_rag_status_get_endpoint(self, client_admin):
        """Test convenience GET endpoint for RAG status."""
        response = client_admin.get("/agent/tools/rag/status")
        assert response.status_code == 200
        data = response.json()
        assert "documents" in data or "status" in data

    def test_rag_action_generic_endpoint(self, client_admin, monkeypatch):
        """Test generic POST /{action} endpoint."""
        response = client_admin.post("/agent/tools/rag/rag.status", json={})
        assert response.status_code == 200
        data = response.json()
        assert data.get("ok") is True
        assert "result" in data
        assert "action" in data

    @patch("app.services.rag_store.ingest_urls")
    def test_rag_ingest_url_form_endpoint(self, mock_ingest, client_admin):
        """Test convenience form-encoded ingest_url endpoint."""
        mock_ingest.return_value = {"ok": True, "results": []}

        response = client_admin.post(
            "/agent/tools/rag/ingest_url", data={"url": "https://example.com"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data.get("ok") is True


class TestAgentRagIntegration:
    """Test RAG intent detection and agent router integration."""

    def test_detect_rag_intent_seed(self):
        """Test RAG intent detection for seed command."""
        from app.services.agent_detect import detect_rag_intent

        intent = detect_rag_intent("Seed the RAG index")
        assert intent is not None
        assert intent["tool"] == "rag"
        assert intent["action"] == "rag.seed"

    def test_detect_rag_intent_status(self):
        """Test RAG intent detection for status query."""
        from app.services.agent_detect import detect_rag_intent

        intent = detect_rag_intent("What's the RAG index status?")
        assert intent is not None
        assert intent["tool"] == "rag"
        assert intent["action"] == "rag.status"

    def test_detect_rag_intent_rebuild(self):
        """Test RAG intent detection for rebuild command."""
        from app.services.agent_detect import detect_rag_intent

        intent = detect_rag_intent("Rebuild the knowledge index")
        assert intent is not None
        assert intent["tool"] == "rag"
        assert intent["action"] == "rag.rebuild"

    def test_detect_rag_intent_ingest_url(self):
        """Test RAG intent detection for URL ingest with extraction."""
        from app.services.agent_detect import detect_rag_intent

        intent = detect_rag_intent("Ingest https://example.com/docs")
        assert intent is not None
        assert intent["tool"] == "rag"
        assert intent["action"] == "rag.ingest_url"
        assert intent["payload"]["url"] == "https://example.com/docs"

    def test_detect_rag_intent_no_match(self):
        """Test RAG intent detection returns None for non-RAG queries."""
        from app.services.agent_detect import detect_rag_intent

        intent = detect_rag_intent("Show me my transactions")
        assert intent is None
