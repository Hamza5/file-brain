"""
API tests for /api/v1/config/watch-paths endpoints.
"""


def test_get_watch_paths_empty(client):
    """Returns empty list initially."""
    response = client.get("/api/v1/config/watch-paths")

    assert response.status_code == 200
    assert response.json() == []


def test_create_watch_path_success(client, temp_dir):
    """Creates valid watch path."""
    response = client.post(
        "/api/v1/config/watch-paths",
        json={
            "path": str(temp_dir),
            "enabled": True,
            "include_subdirectories": True,
            "is_excluded": False,
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert data["path"] == str(temp_dir)
    assert data["enabled"] is True


def test_create_watch_path_not_found(client):
    """400 for non-existent path."""
    response = client.post(
        "/api/v1/config/watch-paths",
        json={
            "path": "/nonexistent/path",
            "enabled": True,
            "include_subdirectories": True,
            "is_excluded": False,
        },
    )

    assert response.status_code == 400


def test_create_watch_path_not_directory(client, temp_file):
    """400 for file path."""
    response = client.post(
        "/api/v1/config/watch-paths",
        json={
            "path": str(temp_file),
            "enabled": True,
            "include_subdirectories": True,
            "is_excluded": False,
        },
    )

    assert response.status_code == 400


def test_get_watch_paths_enabled_only(client, temp_dir, db_session):
    """Filter by enabled flag."""
    from file_brain.database.repositories.watch_path import WatchPathRepository

    repo = WatchPathRepository(db_session)
    repo.create({"path": str(temp_dir), "enabled": True})
    repo.create({"path": str(temp_dir / "sub"), "enabled": False})

    response = client.get("/api/v1/config/watch-paths?enabled_only=true")

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["enabled"] is True


def test_update_watch_path_success(client, temp_dir, db_session):
    """Update existing path."""
    from file_brain.database.repositories.watch_path import WatchPathRepository

    repo = WatchPathRepository(db_session)
    watch_path = repo.create({"path": str(temp_dir), "enabled": True})

    response = client.put(
        f"/api/v1/config/watch-paths/{watch_path.id}",
        json={"enabled": False},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["enabled"] is False


def test_update_watch_path_not_found(client):
    """404 for invalid ID."""
    response = client.put(
        "/api/v1/config/watch-paths/999",
        json={"enabled": False},
    )

    assert response.status_code == 404


def test_delete_watch_path_success(client, temp_dir, db_session):
    """Delete existing path."""
    from file_brain.database.repositories.watch_path import WatchPathRepository

    repo = WatchPathRepository(db_session)
    watch_path = repo.create({"path": str(temp_dir)})

    response = client.delete(f"/api/v1/config/watch-paths/{watch_path.id}")

    assert response.status_code == 200
    assert response.json()["success"] is True


def test_delete_watch_path_not_found(client):
    """404 for invalid ID."""
    response = client.delete("/api/v1/config/watch-paths/999")

    assert response.status_code == 404


def test_clear_watch_paths(client, temp_dir, db_session):
    """Delete all paths."""
    from file_brain.database.repositories.watch_path import WatchPathRepository

    repo = WatchPathRepository(db_session)
    repo.create({"path": str(temp_dir)})
    repo.create({"path": str(temp_dir / "sub")})

    response = client.delete("/api/v1/config/watch-paths")

    assert response.status_code == 200
    assert response.json()["success"] is True

    # Verify all deleted
    get_response = client.get("/api/v1/config/watch-paths")
    assert len(get_response.json()) == 0
