from fastapi.testclient import TestClient
from app.main import app
from app.services import help_cache

client = TestClient(app)

def test_admin_cache_reset_works(monkeypatch):
    # seed cache
    help_cache.set_("k1", {"text": "a"})
    assert help_cache.size() >= 1

    # route should allow without token if ADMIN_TOKEN unset
    r = client.post("/admin/help-cache/reset")
    assert r.status_code == 204
    assert help_cache.size() == 0
    s = help_cache.stats()
    assert s["hits"] == 0 and s["misses"] == 0 and s["evictions"] == 0
