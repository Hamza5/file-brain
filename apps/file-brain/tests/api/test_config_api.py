"""
API tests for /api/v1/config endpoint.
"""


def test_get_config_returns_typesense_config(client):
    """Response contains typesense object with required fields."""
    response = client.get("/api/v1/config")

    assert response.status_code == 200
    data = response.json()
    assert "typesense" in data


def test_get_config_typesense_fields(client):
    """Typesense config has api_key, host, port, protocol, collection_name."""
    response = client.get("/api/v1/config")

    assert response.status_code == 200
    typesense = response.json()["typesense"]

    assert "api_key" in typesense
    assert "host" in typesense
    assert "port" in typesense
    assert "protocol" in typesense
    assert "collection_name" in typesense
