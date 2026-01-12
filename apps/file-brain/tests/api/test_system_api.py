"""
API tests for /api/v1/system endpoints.
"""


def test_initialization_status_structure(client):
    """Response has timestamp, overall_status, services."""
    response = client.get("/api/v1/system/initialization")

    assert response.status_code == 200
    data = response.json()

    assert "timestamp" in data
    assert "overall_status" in data
    assert "services" in data
    assert "initialization_progress" in data


def test_initialization_status_capabilities(client):
    """Contains capabilities object."""
    response = client.get("/api/v1/system/initialization")

    assert response.status_code == 200
    data = response.json()

    assert "capabilities" in data
    capabilities = data["capabilities"]

    assert "configuration_api" in capabilities
    assert "search_api" in capabilities
    assert "crawl_api" in capabilities
    assert "full_functionality" in capabilities


def test_get_services_status(client):
    """Returns all registered services."""
    response = client.get("/api/v1/system/services")

    assert response.status_code == 200
    data = response.json()

    assert "timestamp" in data
    assert "services" in data
    assert isinstance(data["services"], dict)


def test_get_service_logs(client):
    """Returns logs for specific service."""
    # First get list of services
    services_response = client.get("/api/v1/system/services")
    services = services_response.json()["services"]

    if services:
        # Get logs for first service
        service_name = list(services.keys())[0]
        response = client.get(f"/api/v1/system/services/{service_name}/logs")

        assert response.status_code == 200
        data = response.json()
        assert "service" in data
        assert "logs" in data


def test_retry_service_not_found(client):
    """404 for unknown service."""
    response = client.post("/api/v1/system/services/nonexistent_service/retry")

    assert response.status_code == 404
