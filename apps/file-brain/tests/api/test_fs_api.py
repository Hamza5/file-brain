"""
API tests for /api/v1/fs endpoints.
"""


def test_get_roots_includes_home(client):
    """Response includes Home directory."""
    response = client.get("/api/v1/fs/roots")

    assert response.status_code == 200
    roots = response.json()
    assert len(roots) > 0

    # Should have at least one root
    assert any(root["name"] == "Home" for root in roots)


def test_get_roots_has_default(client):
    """At least one root is default."""
    response = client.get("/api/v1/fs/roots")

    assert response.status_code == 200
    roots = response.json()

    # At least one should be marked as default
    assert any(root["isDefault"] for root in roots)


def test_list_directory_valid(client, temp_dir):
    """Lists subdirectories."""
    # Create some subdirectories
    (temp_dir / "dir1").mkdir()
    (temp_dir / "dir2").mkdir()
    (temp_dir / "file.txt").write_text("test")  # Should not appear

    response = client.get(f"/api/v1/fs/list?path={temp_dir}")

    assert response.status_code == 200
    entries = response.json()

    # Should only list directories, not files
    assert len(entries) == 2
    assert all(entry["type"] == "directory" for entry in entries)


def test_list_directory_not_found(client):
    """404 for non-existent path."""
    response = client.get("/api/v1/fs/list?path=/nonexistent/path")

    assert response.status_code == 404


def test_list_directory_not_directory(client, temp_file):
    """400 for file path."""
    response = client.get(f"/api/v1/fs/list?path={temp_file}")

    assert response.status_code == 400


def test_list_directory_sorted(client, temp_dir):
    """Results sorted alphabetically."""
    # Create directories in non-alphabetical order
    (temp_dir / "zebra").mkdir()
    (temp_dir / "apple").mkdir()
    (temp_dir / "banana").mkdir()

    response = client.get(f"/api/v1/fs/list?path={temp_dir}")

    assert response.status_code == 200
    entries = response.json()

    names = [entry["name"] for entry in entries]
    assert names == ["apple", "banana", "zebra"]
