from fastapi.testclient import TestClient
from app.main import app


def test_version_content_length_exact():
    c = TestClient(app)
    r = c.get('/version')
    assert r.status_code == 200
    data = r.json()
    assert set(data) == {"version","commit","built_at","startup_ts"}
    assert isinstance(data["startup_ts"], int)
    # Ensure Content-Length header matches actual body length
    cl = int(r.headers.get('content-length', len(r.content)))
    assert cl == len(r.content)
