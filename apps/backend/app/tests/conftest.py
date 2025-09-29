import os
import pytest

pytestmark = pytest.mark.httpapi

HERMETIC = os.getenv("HERMETIC") == "1"
if not HERMETIC:
	from fastapi.testclient import TestClient  # type: ignore

# Keep environment lightweight for these simple endpoint tests
os.environ.setdefault("APP_ENV", "test")
os.environ.setdefault("ENCRYPTION_ENABLED", "0")

@pytest.fixture
def client():
	if HERMETIC:
		pytest.skip("client fixture skipped in hermetic mode")
	from app.main import app  # local import so any env tweaks above apply
	with TestClient(app) as c:
		yield c
