"""
API tests for /api/v1/files/preview endpoint.
"""


def test_preview_endpoint_rejects_directory_traversal(client):
    """Preview endpoint rejects paths with directory traversal."""
    response = client.get("/api/v1/files/preview?file_path=../etc/passwd&max_size=300")

    assert response.status_code == 400
    assert "Invalid file path" in response.json()["detail"]


def test_preview_endpoint_returns_404_for_nonexistent_file(client):
    """Preview endpoint returns 404 for files that don't exist."""
    response = client.get("/api/v1/files/preview?file_path=/nonexistent/file.txt&max_size=300")

    assert response.status_code == 404
    assert "File not found" in response.json()["detail"]


def test_preview_endpoint_returns_404_for_directory(client, tmp_path):
    """Preview endpoint returns 400 when path is a directory."""
    test_dir = tmp_path / "test_dir"
    test_dir.mkdir()

    response = client.get(f"/api/v1/files/preview?file_path={test_dir}&max_size=300")

    assert response.status_code == 400
    assert "Path is not a file" in response.json()["detail"]


def test_preview_endpoint_returns_404_when_no_thumbnail(client, tmp_path):
    """Preview endpoint returns 404 when OS has no thumbnail cached."""
    # Create a temporary file that won't have a thumbnail
    test_file = tmp_path / "test.txt"
    test_file.write_text("test content")

    response = client.get(f"/api/v1/files/preview?file_path={test_file}&max_size=300")

    # Should return 404 since no thumbnail exists
    assert response.status_code == 404
    assert "No thumbnail available" in response.json()["detail"]


def test_preview_endpoint_accepts_max_size_parameter(client, tmp_path):
    """Preview endpoint accepts and uses max_size parameter."""
    test_file = tmp_path / "test.txt"
    test_file.write_text("test content")

    # Test with different max_size values
    for max_size in [128, 256, 512, 800]:
        response = client.get(f"/api/v1/files/preview?file_path={test_file}&max_size={max_size}")

        # Should return 404 (no thumbnail), but shouldn't error on max_size
        assert response.status_code == 404
