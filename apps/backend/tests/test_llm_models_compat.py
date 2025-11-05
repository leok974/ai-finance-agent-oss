import pytest


@pytest.mark.anyio
async def test_llm_models_shim(asgi_client):
    response = await asgi_client.get("/llm/models")
    assert response.status_code == 200, response.text
    data = response.json()

    assert "models_ok" in data
    assert "path" in data
    assert any(
        k in data for k in ("primary", "fallback", "provider")
    ), "Expected provider metadata in response"
