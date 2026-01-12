"""
API tests for /api/v1/files endpoints.
"""


def test_get_file_operation_info(client):
    """Returns supported operations."""
    response = client.get("/api/v1/files/info")

    assert response.status_code == 200
    data = response.json()

    assert "system" in data
    assert "operations" in data


def test_get_file_operation_info_platform(client):
    """Includes platform-specific info."""
    response = client.get("/api/v1/files/info")

    assert response.status_code == 200
    data = response.json()

    # Should have platform information
    assert data["system"] in ["Linux", "Darwin", "Windows"]


def test_open_file_not_found(client):
    """404 for non-existent file."""
    response = client.post(
        "/api/v1/files/open",
        json={"file_path": "/nonexistent/file.txt", "operation": "file"},
    )

    assert response.status_code == 404


def test_open_folder_not_found(client):
    """404 for non-existent file."""
    response = client.post(
        "/api/v1/files/open",
        json={"file_path": "/nonexistent/file.txt", "operation": "folder"},
    )

    assert response.status_code == 404
