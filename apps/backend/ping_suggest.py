# ping_suggest.py
from fastapi.testclient import TestClient
from app.main import app

c = TestClient(app)
r = c.get("/ml/suggest?month=2025-08&limit=10&topk=3")
print("STATUS:", r.status_code)
print("BODY:", r.text)
