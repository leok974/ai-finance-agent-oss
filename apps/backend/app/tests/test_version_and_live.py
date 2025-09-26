def test_live(client):
    r = client.get('/live')
    assert r.status_code == 200
    assert r.json().get('ok') is True

def test_version_endpoint(client):
    r = client.get('/version')
    assert r.status_code == 200
    data = r.json()
    assert 'branch' in data and 'commit' in data and 'build_time' in data
