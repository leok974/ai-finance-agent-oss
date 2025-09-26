from fastapi.testclient import TestClient
from app.main import app

def test_config_endpoint_exposes_rephrase_default():
    client = TestClient(app)
    r = client.get('/config')
    assert r.status_code == 200
    data = r.json()
    # Required keys
    for k in ['env', 'debug', 'help_rephrase_default', 'help_cache']:
        assert k in data
    # Value types
    assert isinstance(data['env'], str)
    assert isinstance(data['debug'], bool)
    assert isinstance(data['help_rephrase_default'], bool)
    # help_cache stats structure
    hc = data['help_cache']
    assert isinstance(hc, dict)
    for k in ['hits','misses','size']:
        assert k in hc
        assert isinstance(hc[k], int)
