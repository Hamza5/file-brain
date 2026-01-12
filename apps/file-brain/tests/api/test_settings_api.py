"""
API tests for /api/v1/config/settings endpoints.
"""


def test_get_all_settings_empty(client):
    """Returns empty dict when no settings."""
    response = client.get("/api/v1/config/settings/")

    assert response.status_code == 200
    assert response.json() == {}


def test_get_all_settings_with_data(client, db_session):
    """Returns all settings as dict."""
    from file_brain.database.repositories.settings import SettingsRepository

    repo = SettingsRepository(db_session)
    repo.set("key1", "value1")
    repo.set("key2", "value2")

    response = client.get("/api/v1/config/settings/")

    assert response.status_code == 200
    data = response.json()
    assert data == {"key1": "value1", "key2": "value2"}


def test_get_setting_exists(client, db_session):
    """Returns specific setting."""
    from file_brain.database.repositories.settings import SettingsRepository

    repo = SettingsRepository(db_session)
    repo.set("test_key", "test_value")

    response = client.get("/api/v1/config/settings/test_key")

    assert response.status_code == 200
    data = response.json()
    assert data["key"] == "test_key"
    assert data["value"] == "test_value"


def test_get_setting_not_found(client):
    """Returns 404 for missing key."""
    response = client.get("/api/v1/config/settings/nonexistent")

    assert response.status_code == 404


def test_update_setting_new(client):
    """Creates new setting via PUT."""
    response = client.put(
        "/api/v1/config/settings/new_key",
        params={"value": "new_value", "description": "Test setting"},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["key"] == "new_key"
    assert data["value"] == "new_value"


def test_update_setting_existing(client, db_session):
    """Updates existing setting."""
    from file_brain.database.repositories.settings import SettingsRepository

    repo = SettingsRepository(db_session)
    repo.set("existing_key", "old_value")

    response = client.put(
        "/api/v1/config/settings/existing_key",
        params={"value": "new_value"},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["value"] == "new_value"
