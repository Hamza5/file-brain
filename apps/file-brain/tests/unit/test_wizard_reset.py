"""
Unit tests for wizard reset functionality in StartupChecker.
"""

from unittest.mock import MagicMock, patch

import pytest

from file_brain.services.startup_checker import StartupChecker


@pytest.mark.asyncio
async def test_check_wizard_reset_completed():
    """Wizard reset check passes when wizard is completed."""
    # Mock the database session and repository
    mock_state = MagicMock()
    mock_state.wizard_completed = True

    mock_repo = MagicMock()
    mock_repo.get.return_value = mock_state

    with (
        patch("file_brain.services.startup_checker.db_session") as mock_db_session,
        patch("file_brain.services.startup_checker.WizardStateRepository") as mock_repo_class,
    ):
        # Setup context manager
        mock_db = MagicMock()
        mock_db_session.return_value.__enter__.return_value = mock_db
        mock_db_session.return_value.__exit__.return_value = None

        # Setup repository
        mock_repo_class.return_value = mock_repo

        # Create checker with mocked dependencies
        with (
            patch("file_brain.services.startup_checker.get_docker_manager"),
            patch("file_brain.services.startup_checker.get_model_downloader"),
            patch("file_brain.services.startup_checker.get_typesense_client"),
        ):
            checker = StartupChecker()
            result = await checker.check_wizard_reset()

            assert result.passed is True
            assert "completed" in result.message.lower()


@pytest.mark.asyncio
async def test_check_wizard_reset_not_completed():
    """Wizard reset check fails when wizard is not completed or was reset."""
    # Mock the database session and repository
    mock_state = MagicMock()
    mock_state.wizard_completed = False

    mock_repo = MagicMock()
    mock_repo.get.return_value = mock_state

    with (
        patch("file_brain.services.startup_checker.db_session") as mock_db_session,
        patch("file_brain.services.startup_checker.WizardStateRepository") as mock_repo_class,
    ):
        # Setup context manager
        mock_db = MagicMock()
        mock_db_session.return_value.__enter__.return_value = mock_db
        mock_db_session.return_value.__exit__.return_value = None

        # Setup repository
        mock_repo_class.return_value = mock_repo

        # Create checker with mocked dependencies
        with (
            patch("file_brain.services.startup_checker.get_docker_manager"),
            patch("file_brain.services.startup_checker.get_model_downloader"),
            patch("file_brain.services.startup_checker.get_typesense_client"),
        ):
            checker = StartupChecker()
            result = await checker.check_wizard_reset()

            assert result.passed is False
            assert "not completed" in result.message.lower() or "reset" in result.message.lower()


@pytest.mark.asyncio
async def test_check_wizard_reset_no_state():
    """Wizard reset check fails when no wizard state exists in database."""
    mock_repo = MagicMock()
    mock_repo.get.return_value = None

    with (
        patch("file_brain.services.startup_checker.db_session") as mock_db_session,
        patch("file_brain.services.startup_checker.WizardStateRepository") as mock_repo_class,
    ):
        # Setup context manager
        mock_db = MagicMock()
        mock_db_session.return_value.__enter__.return_value = mock_db
        mock_db_session.return_value.__exit__.return_value = None

        # Setup repository
        mock_repo_class.return_value = mock_repo

        # Create checker with mocked dependencies
        with (
            patch("file_brain.services.startup_checker.get_docker_manager"),
            patch("file_brain.services.startup_checker.get_model_downloader"),
            patch("file_brain.services.startup_checker.get_typesense_client"),
        ):
            checker = StartupChecker()
            result = await checker.check_wizard_reset()

            assert result.passed is False
            assert "not completed" in result.message.lower() or "reset" in result.message.lower()


@pytest.mark.asyncio
async def test_perform_all_checks_wizard_reset():
    """All system checks pass but wizard was reset - should show wizard."""
    from unittest.mock import AsyncMock

    # Mock all system checks to pass
    mock_docker_manager = MagicMock()
    mock_docker_manager.get_docker_info.return_value = {"available": True, "command": "docker", "version": "27.0.1"}
    mock_docker_manager.check_required_images = AsyncMock(return_value={"success": True, "all_present": True})
    mock_docker_manager.get_services_status = AsyncMock(return_value={"healthy": True, "running": True})

    mock_model_downloader = MagicMock()
    mock_model_downloader.check_model_exists.return_value = {"exists": True, "missing_files": []}

    mock_typesense_client = MagicMock()
    mock_typesense_client.check_collection_exists = AsyncMock(return_value=True)

    # Mock wizard state as not completed (reset)
    mock_state = MagicMock()
    mock_state.wizard_completed = False

    mock_repo = MagicMock()
    mock_repo.get.return_value = mock_state

    with (
        patch("file_brain.services.startup_checker.get_docker_manager", return_value=mock_docker_manager),
        patch("file_brain.services.startup_checker.get_model_downloader", return_value=mock_model_downloader),
        patch("file_brain.services.startup_checker.get_typesense_client", return_value=mock_typesense_client),
        patch("file_brain.services.startup_checker.db_session") as mock_db_session,
        patch("file_brain.services.startup_checker.WizardStateRepository") as mock_repo_class,
    ):
        # Setup database mocks
        mock_db = MagicMock()
        mock_db_session.return_value.__enter__.return_value = mock_db
        mock_db_session.return_value.__exit__.return_value = None
        mock_repo_class.return_value = mock_repo

        checker = StartupChecker()
        result = await checker.perform_all_checks()

        # All system checks passed but wizard was reset
        assert result.docker_available.passed is True
        assert result.docker_images.passed is True
        assert result.services_healthy.passed is True
        assert result.model_downloaded.passed is True
        assert result.collection_ready.passed is True
        assert result.schema_current.passed is True
        assert result.wizard_reset.passed is False  # Wizard was reset

        # Should show wizard due to reset
        assert result.all_checks_passed is False
        assert result.needs_wizard is True
        assert result.get_first_failed_step() == 0  # Start from beginning when reset
