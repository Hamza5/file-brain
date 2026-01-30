"""
Unit tests for StartupChecker service.
"""

from unittest.mock import MagicMock, patch

import pytest

from file_brain.services.startup_checker import CheckDetail, StartupChecker


@pytest.fixture
def mock_docker_manager():
    """Mock docker manager for testing."""
    manager = MagicMock()
    manager.get_docker_info = MagicMock()
    manager.check_required_images = MagicMock()
    manager.get_services_status = MagicMock()
    return manager


@pytest.fixture
def mock_model_downloader():
    """Mock model downloader for testing."""
    downloader = MagicMock()
    downloader.check_model_exists = MagicMock()
    return downloader


@pytest.fixture
def mock_typesense_client():
    """Mock typesense client for testing."""
    client = MagicMock()
    client.check_collection_exists = MagicMock()
    return client


@pytest.fixture(autouse=True)
def mock_wizard_state():
    """Mock wizard state as completed for all tests by default."""
    mock_state = MagicMock()
    mock_state.wizard_completed = True

    mock_repo = MagicMock()
    mock_repo.get.return_value = mock_state

    with (
        patch("file_brain.services.startup_checker.db_session") as mock_db_session,
        patch("file_brain.services.startup_checker.WizardStateRepository") as mock_repo_class,
    ):
        # Setup database mocks
        mock_db = MagicMock()
        mock_db_session.return_value.__enter__.return_value = mock_db
        mock_db_session.return_value.__exit__.return_value = None
        mock_repo_class.return_value = mock_repo
        yield


@pytest.fixture
def startup_checker(mock_docker_manager, mock_model_downloader, mock_typesense_client):
    """Create a StartupChecker with mocked dependencies."""
    with (
        patch("file_brain.services.startup_checker.get_docker_manager", return_value=mock_docker_manager),
        patch("file_brain.services.startup_checker.get_model_downloader", return_value=mock_model_downloader),
        patch("file_brain.services.startup_checker.get_typesense_client", return_value=mock_typesense_client),
    ):
        checker = StartupChecker()
        # Replace the dependencies with our mocks
        checker.docker_manager = mock_docker_manager
        checker.model_downloader = mock_model_downloader
        checker.typesense_client = mock_typesense_client
        yield checker


# ============================================================================
# Individual Check Tests
# ============================================================================


def test_check_docker_available_success(startup_checker, mock_docker_manager):
    """Docker check passes when Docker is available."""
    mock_docker_manager.get_docker_info.return_value = {
        "available": True,
        "running": True,
        "command": "docker",
        "version": "27.0.1",
    }

    result = startup_checker.check_docker_available()

    assert result.passed is True
    assert "running" in result.message.lower()
    assert "27.0.1" in result.message


def test_check_docker_available_failure(startup_checker, mock_docker_manager):
    """Docker check fails when Docker is not available."""
    mock_docker_manager.get_docker_info.return_value = {
        "available": False,
        "running": False,
        "error": "Command not found",
    }

    result = startup_checker.check_docker_available()

    assert result.passed is False
    assert "not installed" in result.message.lower()


def test_check_docker_images_success(startup_checker, mock_docker_manager):
    """Images check passes when all images are present."""
    mock_docker_manager.check_required_images.return_value = {
        "success": True,
        "all_present": True,
        "missing": [],
    }

    result = startup_checker.check_docker_images()

    assert result.passed is True
    assert "All required images present" in result.message


def test_check_docker_images_failure(startup_checker, mock_docker_manager):
    """Images check fails when images are missing."""
    mock_docker_manager.check_required_images.return_value = {
        "success": True,
        "all_present": False,
        "missing": ["hamza5/tika:latest-full", "hamza5/typesense-gpu:29.0"],
    }

    result = startup_checker.check_docker_images()

    assert result.passed is False
    assert "2 image(s) missing" in result.message


def test_check_services_healthy_success(startup_checker, mock_docker_manager):
    """Services check passes when all services are healthy."""
    mock_docker_manager.get_services_status.return_value = {
        "healthy": True,
        "running": True,
    }

    result = startup_checker.check_services_healthy()

    assert result.passed is True
    assert "All services healthy" in result.message


def test_check_services_healthy_running_not_healthy(startup_checker, mock_docker_manager):
    """Services check fails when services are running but not healthy."""
    mock_docker_manager.get_services_status.return_value = {
        "healthy": False,
        "running": True,
    }
    # Skip service start step - app will start services automatically
    # Only show this step if explicitly needed (which it never is now)
    result = startup_checker.check_services_healthy()

    assert result.passed is False
    assert "running but not healthy" in result.message


def test_check_services_healthy_not_running(startup_checker, mock_docker_manager):
    """Services check fails when services are not running."""
    mock_docker_manager.get_services_status.return_value = {
        "healthy": False,
        "running": False,
    }

    result = startup_checker.check_services_healthy()

    assert result.passed is False
    assert "not running" in result.message


def test_check_model_downloaded_success(startup_checker, mock_model_downloader):
    """Model check passes when model exists."""
    mock_model_downloader.check_model_exists.return_value = {
        "exists": True,
        "missing_files": [],
    }

    result = startup_checker.check_model_downloaded()

    assert result.passed is True
    assert "ready" in result.message


def test_check_model_downloaded_failure(startup_checker, mock_model_downloader):
    """Model check fails when model files are missing."""
    mock_model_downloader.check_model_exists.return_value = {
        "exists": False,
        "missing_files": ["model.safetensors", "config.json", "tokenizer.json"],
    }

    result = startup_checker.check_model_downloaded()

    assert result.passed is False
    assert "3 model file(s) missing" in result.message


def test_check_collection_ready_success(startup_checker, mock_typesense_client):
    """Collection check passes when collection exists."""
    mock_typesense_client.check_collection_exists.return_value = True

    result = startup_checker.check_collection_ready()

    assert result.passed is True
    assert "exists" in result.message


def test_check_collection_ready_failure(startup_checker, mock_typesense_client):
    """Collection check fails when collection doesn't exist."""
    mock_typesense_client.check_collection_exists.return_value = False

    result = startup_checker.check_collection_ready()

    assert result.passed is False
    assert "not found" in result.message


def test_check_schema_current_success(startup_checker, mock_typesense_client):
    """Schema check passes when collection exists (basic implementation)."""
    mock_typesense_client.check_collection_exists.return_value = True

    result = startup_checker.check_schema_current()

    assert result.passed is True
    assert "Schema version" in result.message


def test_check_schema_current_no_collection(startup_checker, mock_typesense_client):
    """Schema check fails when collection doesn't exist."""
    mock_typesense_client.check_collection_exists.return_value = False

    result = startup_checker.check_schema_current()

    assert result.passed is False
    assert "does not exist" in result.message


# ============================================================================
# Combined Check Tests
# ============================================================================


def test_perform_all_checks_all_pass(
    startup_checker, mock_docker_manager, mock_model_downloader, mock_typesense_client
):
    """All checks pass in ideal scenario."""
    # Setup all mocks to return success
    mock_docker_manager.get_docker_info.return_value = {
        "available": True,
        "running": True,
        "command": "docker",
        "version": "27.0.1",
    }
    mock_docker_manager.check_required_images.return_value = {"success": True, "all_present": True, "missing": []}
    mock_docker_manager.get_services_status.return_value = {"healthy": True, "running": True}
    mock_model_downloader.check_model_exists.return_value = {"exists": True, "missing_files": []}
    mock_typesense_client.check_collection_exists.return_value = True

    result = startup_checker.perform_all_checks()

    assert result.all_checks_passed is True
    assert result.needs_wizard is False
    assert result.is_first_run is False  # Wizard was completed
    assert result.get_first_failed_step() is None
    assert result.is_upgrade is False


def test_perform_all_checks_docker_missing(startup_checker, mock_docker_manager):
    """First check fails when Docker is missing."""
    mock_docker_manager.get_docker_info.return_value = {"available": False, "running": False, "error": "Not found"}
    # Other checks don't matter if Docker is missing
    mock_docker_manager.check_required_images.return_value = {"success": True, "all_present": True}
    mock_docker_manager.get_services_status.return_value = {"healthy": True, "running": True}

    result = startup_checker.perform_all_checks()

    assert result.all_checks_passed is False
    assert result.needs_wizard is False  # Docker missing doesn't trigger wizard on normal runs
    assert result.is_first_run is False  # Wizard was completed before
    assert result.get_first_failed_step() == 0  # Docker check step
    assert result.is_upgrade is False  # No upgrade if Docker isn't available


def test_perform_all_checks_images_missing(
    startup_checker, mock_docker_manager, mock_model_downloader, mock_typesense_client
):
    """Images check fails in upgrade scenario."""
    # Docker available but images missing
    mock_docker_manager.get_docker_info.return_value = {
        "available": True,
        "running": True,
        "command": "docker",
        "version": "27.0.1",
    }
    mock_docker_manager.check_required_images.return_value = {
        "success": True,
        "all_present": False,
        "missing": ["image1"],
    }
    mock_docker_manager.get_services_status.return_value = {"healthy": False, "running": False}
    mock_model_downloader.check_model_exists.return_value = {"exists": True, "missing_files": []}
    mock_typesense_client.check_collection_exists.return_value = True

    result = startup_checker.perform_all_checks()

    assert result.all_checks_passed is False
    assert result.needs_wizard is False  # Images missing doesn't trigger wizard on normal runs
    assert result.is_first_run is False  # Wizard was completed before
    assert result.get_first_failed_step() == 1  # Image pull step
    assert result.is_upgrade is True  # Docker available + some checks passed


def test_perform_all_checks_services_not_healthy(
    startup_checker, mock_docker_manager, mock_model_downloader, mock_typesense_client
):
    """Services check fails when containers are running but unhealthy - wizard should NOT show."""
    mock_docker_manager.get_docker_info.return_value = {
        "available": True,
        "running": True,
        "command": "docker",
        "version": "27.0.1",
    }
    mock_docker_manager.check_required_images.return_value = {"success": True, "all_present": True}
    mock_docker_manager.get_services_status.return_value = {"healthy": False, "running": True}
    mock_model_downloader.check_model_exists.return_value = {"exists": True, "missing_files": []}
    mock_typesense_client.check_collection_exists.return_value = True

    result = startup_checker.perform_all_checks()

    assert result.all_checks_passed is False
    # Services running but not healthy should NOT trigger wizard (critical checks passed)
    assert result.needs_wizard is False
    assert result.get_first_failed_step() is None  # No wizard step needed
    assert result.is_upgrade is False  # All critical checks passed


def test_perform_all_checks_services_not_running(
    startup_checker, mock_docker_manager, mock_model_downloader, mock_typesense_client
):
    """Services not running should NOT trigger wizard - app will start them automatically."""
    mock_docker_manager.get_docker_info.return_value = {
        "available": True,
        "running": True,
        "command": "docker",
        "version": "27.0.1",
    }
    mock_docker_manager.check_required_images.return_value = {"success": True, "all_present": True}
    mock_docker_manager.get_services_status.return_value = {"healthy": False, "running": False}
    mock_model_downloader.check_model_exists.return_value = {"exists": True, "missing_files": []}
    mock_typesense_client.check_collection_exists.return_value = True

    result = startup_checker.perform_all_checks()

    assert result.all_checks_passed is False  # Services check failed
    assert result.needs_wizard is False  # But wizard not needed - app will start services
    assert result.get_first_failed_step() is None  # No wizard step needed
    assert result.is_upgrade is False  # All critical checks passed


def test_perform_all_checks_model_missing(
    startup_checker, mock_docker_manager, mock_model_downloader, mock_typesense_client
):
    """Model check fails when model isn't downloaded."""
    mock_docker_manager.get_docker_info.return_value = {
        "available": True,
        "running": True,
        "command": "docker",
        "version": "27.0.1",
    }
    mock_docker_manager.check_required_images.return_value = {"success": True, "all_present": True}
    mock_docker_manager.get_services_status.return_value = {"healthy": True, "running": True}
    mock_model_downloader.check_model_exists.return_value = {"exists": False, "missing_files": ["model.safetensors"]}
    mock_typesense_client.check_collection_exists.return_value = True

    result = startup_checker.perform_all_checks()

    assert result.all_checks_passed is False
    assert result.needs_wizard is False  # Model missing doesn't trigger wizard on normal runs
    assert result.is_first_run is False  # Wizard was completed before
    assert result.get_first_failed_step() == 3  # Model download step
    assert result.is_upgrade is True


def test_perform_all_checks_collection_missing(
    startup_checker, mock_docker_manager, mock_model_downloader, mock_typesense_client
):
    """Collection check fails when collection doesn't exist."""
    mock_docker_manager.get_docker_info.return_value = {
        "available": True,
        "running": True,
        "command": "docker",
        "version": "27.0.1",
    }
    mock_docker_manager.check_required_images.return_value = {"success": True, "all_present": True}
    mock_docker_manager.get_services_status.return_value = {"healthy": True, "running": True}
    mock_model_downloader.check_model_exists.return_value = {"exists": True, "missing_files": []}
    mock_typesense_client.check_collection_exists.return_value = False

    result = startup_checker.perform_all_checks()

    assert result.all_checks_passed is False
    assert result.needs_wizard is False  # Collection missing doesn't trigger wizard on normal runs
    assert result.is_first_run is False  # Wizard was completed before
    assert result.get_first_failed_step() == 4  # Collection create step
    assert result.is_upgrade is True


# ============================================================================
# Early Exit Optimization Tests
# ============================================================================


def test_perform_all_checks_early_exit_wizard_reset(
    startup_checker, mock_docker_manager, mock_model_downloader, mock_typesense_client
):
    """Network checks are skipped when wizard was reset."""
    # Mock wizard state as NOT completed (reset)
    with (
        patch("file_brain.services.startup_checker.db_session") as mock_db_session,
        patch("file_brain.services.startup_checker.WizardStateRepository") as mock_repo_class,
    ):
        mock_db = MagicMock()
        mock_db_session.return_value.__enter__.return_value = mock_db
        mock_db_session.return_value.__exit__.return_value = None

        mock_state = MagicMock()
        mock_state.wizard_completed = False  # Wizard was reset
        mock_repo = MagicMock()
        mock_repo.get.return_value = mock_state
        mock_repo_class.return_value = mock_repo

        # Setup mocks - these should NOT be called because of early exit
        mock_docker_manager.get_docker_info.return_value = {
            "available": True,
            "running": True,
            "command": "docker",
            "version": "27.0.1",
        }
        mock_model_downloader.check_model_exists.return_value = {"exists": True, "missing_files": []}

        result = startup_checker.perform_all_checks()

        # Verify wizard is needed (first run)
        assert result.needs_wizard is True
        assert result.is_first_run is True
        assert result.get_first_failed_step() == 0

        # Verify network checks were skipped (not called)
        mock_docker_manager.check_required_images.assert_not_called()
        mock_docker_manager.get_services_status.assert_not_called()
        mock_typesense_client.check_collection_exists.assert_not_called()


def test_perform_all_checks_early_exit_model_missing(
    startup_checker, mock_docker_manager, mock_model_downloader, mock_typesense_client
):
    """Network checks are skipped when model is missing."""
    mock_model_downloader.check_model_exists.return_value = {"exists": False, "missing_files": ["model.safetensors"]}
    mock_docker_manager.get_docker_info.return_value = {
        "available": True,
        "running": True,
        "command": "docker",
        "version": "27.0.1",
    }
    mock_docker_manager.check_required_images.return_value = {"success": True, "all_present": True}

    result = startup_checker.perform_all_checks()

    # Model missing but wizard was completed - no wizard needed
    assert result.needs_wizard is False
    assert result.is_first_run is False
    assert result.get_first_failed_step() == 3  # Model download step

    # Docker and images checks are fast, so they run even when model missing
    # But network checks should be skipped
    mock_docker_manager.get_services_status.assert_not_called()
    mock_typesense_client.check_collection_exists.assert_not_called()


def test_perform_all_checks_early_exit_images_missing(
    startup_checker, mock_docker_manager, mock_model_downloader, mock_typesense_client
):
    """Network checks are skipped when Docker images are missing."""
    mock_model_downloader.check_model_exists.return_value = {"exists": True, "missing_files": []}
    mock_docker_manager.get_docker_info.return_value = {
        "available": True,
        "running": True,
        "command": "docker",
        "version": "27.0.1",
    }
    mock_docker_manager.check_required_images.return_value = {
        "success": True,
        "all_present": False,
        "missing": ["hamza5/typesense-gpu:29.0"],
    }

    result = startup_checker.perform_all_checks()

    # Images missing but wizard was completed - no wizard needed
    assert result.needs_wizard is False
    assert result.is_first_run is False
    assert result.get_first_failed_step() == 1  # Image pull step

    # Verify network checks were skipped (not called)
    mock_docker_manager.get_services_status.assert_not_called()
    mock_typesense_client.check_collection_exists.assert_not_called()


def test_perform_all_checks_network_checks_run_when_needed(
    startup_checker, mock_docker_manager, mock_model_downloader, mock_typesense_client
):
    """Network checks ARE run when all critical checks pass (wizard might not be needed)."""
    mock_model_downloader.check_model_exists.return_value = {"exists": True, "missing_files": []}
    mock_docker_manager.get_docker_info.return_value = {
        "available": True,
        "running": True,
        "command": "docker",
        "version": "27.0.1",
    }
    mock_docker_manager.check_required_images.return_value = {"success": True, "all_present": True}
    mock_docker_manager.get_services_status.return_value = {"healthy": True, "running": True}
    mock_typesense_client.check_collection_exists.return_value = True

    result = startup_checker.perform_all_checks()

    # Verify all checks passed
    assert result.all_checks_passed is True
    assert result.needs_wizard is False

    # Verify network checks WERE called (not skipped)
    mock_docker_manager.get_services_status.assert_called_once()
    assert mock_typesense_client.check_collection_exists.call_count == 2  # Once for collection, once for schema


# ============================================================================
# CheckDetail and StartupCheckResult Tests
# ============================================================================


def test_check_detail_creation():
    """CheckDetail can be created with passed and message."""
    detail = CheckDetail(passed=True, message="Test message")
    assert detail.passed is True
    assert detail.message == "Test message"


def test_startup_check_result_all_checks_passed():
    """all_checks_passed property works correctly."""
    from file_brain.services.startup_checker import StartupCheckResult

    # All passed
    result = StartupCheckResult(
        docker_available=CheckDetail(True, "ok"),
        docker_images=CheckDetail(True, "ok"),
        services_healthy=CheckDetail(True, "ok"),
        model_downloaded=CheckDetail(True, "ok"),
        collection_ready=CheckDetail(True, "ok"),
        schema_current=CheckDetail(True, "ok"),
        wizard_reset=CheckDetail(True, "ok"),
    )
    assert result.all_checks_passed is True
    assert result.needs_wizard is False

    # One failed
    result = StartupCheckResult(
        docker_available=CheckDetail(True, "ok"),
        docker_images=CheckDetail(False, "missing"),
        services_healthy=CheckDetail(True, "ok"),
        model_downloaded=CheckDetail(True, "ok"),
        collection_ready=CheckDetail(True, "ok"),
        schema_current=CheckDetail(True, "ok"),
        wizard_reset=CheckDetail(True, "ok"),
    )
    assert result.all_checks_passed is False
    assert result.needs_wizard is False  # Images missing but wizard was completed


def test_startup_check_result_is_upgrade():
    """is_upgrade property correctly identifies upgrade scenarios."""
    from file_brain.services.startup_checker import StartupCheckResult

    # Fresh install (Docker not available)
    result = StartupCheckResult(
        docker_available=CheckDetail(False, "not found"),
        docker_images=CheckDetail(False, "missing"),
        services_healthy=CheckDetail(False, "not running"),
        model_downloaded=CheckDetail(False, "missing"),
        collection_ready=CheckDetail(False, "missing"),
        schema_current=CheckDetail(False, "missing"),
        wizard_reset=CheckDetail(True, "ok"),
    )
    assert result.is_upgrade is False

    # Upgrade scenario (Docker available, some critical checks failed)
    result = StartupCheckResult(
        docker_available=CheckDetail(True, "ok"),
        docker_images=CheckDetail(False, "missing"),  # Critical check failed
        services_healthy=CheckDetail(True, "ok"),
        model_downloaded=CheckDetail(True, "ok"),
        collection_ready=CheckDetail(True, "ok"),
        schema_current=CheckDetail(True, "ok"),
        wizard_reset=CheckDetail(True, "ok"),
    )
    assert result.is_upgrade is True


def test_startup_check_result_get_first_failed_step():
    """get_first_failed_step returns correct wizard step number."""
    from file_brain.services.startup_checker import StartupCheckResult

    # Docker failed
    result = StartupCheckResult(
        docker_available=CheckDetail(False, "not found"),
        docker_images=CheckDetail(True, "ok"),
        services_healthy=CheckDetail(True, "ok"),
        model_downloaded=CheckDetail(True, "ok"),
        collection_ready=CheckDetail(True, "ok"),
        schema_current=CheckDetail(True, "ok"),
        wizard_reset=CheckDetail(True, "ok"),
    )
    assert result.get_first_failed_step() == 0

    # Images failed
    result = StartupCheckResult(
        docker_available=CheckDetail(True, "ok"),
        docker_images=CheckDetail(False, "missing"),
        services_healthy=CheckDetail(True, "ok"),
        model_downloaded=CheckDetail(True, "ok"),
        collection_ready=CheckDetail(True, "ok"),
        schema_current=CheckDetail(True, "ok"),
        wizard_reset=CheckDetail(True, "ok"),
    )
    assert result.get_first_failed_step() == 1

    # Services failed - should NOT trigger wizard (app will start them)
    result = StartupCheckResult(
        docker_available=CheckDetail(True, "ok"),
        docker_images=CheckDetail(True, "ok"),
        services_healthy=CheckDetail(False, "not healthy"),
        model_downloaded=CheckDetail(True, "ok"),
        collection_ready=CheckDetail(True, "ok"),
        schema_current=CheckDetail(True, "ok"),
        wizard_reset=CheckDetail(True, "ok"),
    )
    assert result.get_first_failed_step() is None  # No wizard step needed

    # Model failed
    result = StartupCheckResult(
        docker_available=CheckDetail(True, "ok"),
        docker_images=CheckDetail(True, "ok"),
        services_healthy=CheckDetail(True, "ok"),
        model_downloaded=CheckDetail(False, "missing"),
        collection_ready=CheckDetail(True, "ok"),
        schema_current=CheckDetail(True, "ok"),
        wizard_reset=CheckDetail(True, "ok"),
    )
    assert result.get_first_failed_step() == 3

    # Collection or schema failed
    result = StartupCheckResult(
        docker_available=CheckDetail(True, "ok"),
        docker_images=CheckDetail(True, "ok"),
        services_healthy=CheckDetail(True, "ok"),
        model_downloaded=CheckDetail(True, "ok"),
        collection_ready=CheckDetail(False, "missing"),
        schema_current=CheckDetail(True, "ok"),
        wizard_reset=CheckDetail(True, "ok"),
    )
    assert result.get_first_failed_step() == 4

    # All passed
    result = StartupCheckResult(
        docker_available=CheckDetail(True, "ok"),
        docker_images=CheckDetail(True, "ok"),
        services_healthy=CheckDetail(True, "ok"),
        model_downloaded=CheckDetail(True, "ok"),
        collection_ready=CheckDetail(True, "ok"),
        schema_current=CheckDetail(True, "ok"),
        wizard_reset=CheckDetail(True, "ok"),
    )
    assert result.get_first_failed_step() is None
