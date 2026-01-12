"""
Unit tests for SettingsRepository.
"""

from file_brain.database.repositories.settings import SettingsRepository


def test_set_and_get_value(db_session):
    """Create and retrieve a setting."""
    repo = SettingsRepository(db_session)
    repo.set("test_key", "test_value")

    value = repo.get_value("test_key")
    assert value == "test_value"


def test_get_value_default(db_session):
    """Returns default when key doesn't exist."""
    repo = SettingsRepository(db_session)
    value = repo.get_value("nonexistent", default="default_value")

    assert value == "default_value"


def test_update_existing_setting(db_session):
    """Update overwrites previous value."""
    repo = SettingsRepository(db_session)
    repo.set("test_key", "old_value")
    repo.set("test_key", "new_value")

    value = repo.get_value("test_key")
    assert value == "new_value"


def test_get_bool_true_values(db_session):
    """'true', '1', 'yes', 'on' return True."""
    repo = SettingsRepository(db_session)

    for true_val in ["true", "1", "yes", "on", "True", "YES", "ON"]:
        repo.set("bool_key", true_val)
        assert repo.get_bool("bool_key") is True


def test_get_bool_false_values(db_session):
    """Other values return False."""
    repo = SettingsRepository(db_session)

    for false_val in ["false", "0", "no", "off", "random"]:
        repo.set("bool_key", false_val)
        assert repo.get_bool("bool_key") is False


def test_get_int_valid(db_session):
    """Valid integer strings convert correctly."""
    repo = SettingsRepository(db_session)
    repo.set("int_key", "42")

    assert repo.get_int("int_key") == 42


def test_get_int_invalid(db_session):
    """Invalid strings return default."""
    repo = SettingsRepository(db_session)
    repo.set("int_key", "not_a_number")

    assert repo.get_int("int_key", default=99) == 99


def test_get_all_as_dict(db_session):
    """Returns all settings as dictionary."""
    repo = SettingsRepository(db_session)
    repo.set("key1", "value1")
    repo.set("key2", "value2")

    all_settings = repo.get_all_as_dict()
    assert all_settings == {"key1": "value1", "key2": "value2"}


def test_initialize_defaults(db_session):
    """Creates missing defaults only."""
    repo = SettingsRepository(db_session)
    repo.set("existing_key", "existing_value")

    defaults = {
        "existing_key": "default_value",
        "new_key": "new_value",
    }
    repo.initialize_defaults(defaults)

    # Existing key should not be overwritten
    assert repo.get_value("existing_key") == "existing_value"
    # New key should be created
    assert repo.get_value("new_key") == "new_value"
