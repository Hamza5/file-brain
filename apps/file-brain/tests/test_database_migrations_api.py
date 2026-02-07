from unittest.mock import MagicMock, patch

from file_brain.services.database_migrations import DatabaseMigrationService
from file_brain.services.startup_checker import StartupChecker


def test_startup_checker_db_migration_needed():
    # Mock migration service
    mock_migration_service = MagicMock(spec=DatabaseMigrationService)
    mock_migration_service.check_migration_needed.return_value = (True, "base", "head")

    checker = StartupChecker()
    # Inject mock
    checker.migration_service = mock_migration_service

    # Mock other dependencies of check_db_migration_current if any
    # It only uses migration_service

    result = checker.check_db_migration_current()
    assert result.passed is False
    assert "Database migration needed" in result.message


def test_startup_checker_db_migration_not_needed():
    mock_migration_service = MagicMock(spec=DatabaseMigrationService)
    mock_migration_service.check_migration_needed.return_value = (False, "head", "head")

    checker = StartupChecker()
    checker.migration_service = mock_migration_service

    result = checker.check_db_migration_current()
    assert result.passed is True
    assert "Database schema current" in result.message


def test_api_database_upgrade_success(client):
    with patch("file_brain.services.database_migrations.get_migration_service") as mock_get_service:
        mock_service = MagicMock()
        mock_service.run_upgrade.return_value = (True, ["step 1", "step 2"])
        mock_get_service.return_value = mock_service

        response = client.post("/api/v1/wizard/database-upgrade")
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["message"] == "Database upgrade completed successfully"
        assert len(data["logs"]) == 2

        mock_service.run_upgrade.assert_called_once()


def test_api_database_upgrade_failure(client):
    with patch("file_brain.services.database_migrations.get_migration_service") as mock_get_service:
        mock_service = MagicMock()
        mock_service.run_upgrade.return_value = (False, ["error log"])
        mock_get_service.return_value = mock_service

        response = client.post("/api/v1/wizard/database-upgrade")
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is False
        assert data["message"] == "Database upgrade failed"
