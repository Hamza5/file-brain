"""
Unit tests for WatchPathRepository.
"""

from file_brain.database.repositories.watch_path import WatchPathRepository


def test_create_watch_path(db_session):
    """Create new watch path."""
    repo = WatchPathRepository(db_session)
    watch_path = repo.create(
        {
            "path": "/home/user/docs",
            "enabled": True,
            "include_subdirectories": True,
        }
    )

    assert watch_path.path == "/home/user/docs"
    assert watch_path.enabled is True
    assert watch_path.include_subdirectories is True


def test_create_if_not_exists_new(db_session):
    """Creates when doesn't exist."""
    repo = WatchPathRepository(db_session)
    watch_path = repo.create_if_not_exists("/home/user/docs")

    assert watch_path.path == "/home/user/docs"
    assert watch_path.enabled is True


def test_create_if_not_exists_existing(db_session):
    """Returns existing without creating duplicate."""
    repo = WatchPathRepository(db_session)
    first = repo.create_if_not_exists("/home/user/docs")
    second = repo.create_if_not_exists("/home/user/docs")

    assert first.id == second.id


def test_get_enabled_paths(db_session):
    """Filter to enabled paths only."""
    repo = WatchPathRepository(db_session)
    repo.create({"path": "/home/user/docs", "enabled": True})
    repo.create({"path": "/home/user/downloads", "enabled": False})

    enabled = repo.get_enabled()
    assert len(enabled) == 1
    assert enabled[0].path == "/home/user/docs"


def test_get_excluded_paths(db_session):
    """Filter to excluded paths only."""
    repo = WatchPathRepository(db_session)
    repo.create({"path": "/home/user/docs", "is_excluded": False})
    repo.create({"path": "/home/user/private", "is_excluded": True})

    # Get all and filter manually since there's no get_excluded method
    all_paths = repo.get_all()
    excluded = [p for p in all_paths if p.is_excluded]
    assert len(excluded) == 1
    assert excluded[0].path == "/home/user/private"


def test_update_watch_path(db_session):
    """Update enabled/subdirectories flags."""
    repo = WatchPathRepository(db_session)
    watch_path = repo.create({"path": "/home/user/docs", "enabled": True})

    updated = repo.update(watch_path, {"enabled": False})
    assert updated.enabled is False


def test_delete_watch_path(db_session):
    """Delete by ID."""
    repo = WatchPathRepository(db_session)
    watch_path = repo.create({"path": "/home/user/docs"})

    deleted = repo.delete(watch_path.id)
    assert deleted is not None
    assert repo.get(watch_path.id) is None


def test_delete_all(db_session):
    """Clear all watch paths."""
    repo = WatchPathRepository(db_session)
    repo.create({"path": "/home/user/docs"})
    repo.create({"path": "/home/user/downloads"})

    count = repo.delete_all()
    assert count == 2
    assert len(repo.get_all()) == 0
