"""
Unit tests for DockerManager friendly error messages.
"""

import os
import sys
from unittest.mock import MagicMock, patch

import pytest

from file_brain.services.docker_manager import DockerManager


@pytest.fixture
def docker_manager():
    return DockerManager()


def test_friendly_error_message(docker_manager):
    """Test standard friendly error messages."""

    # Test connection error (Windows style)
    msg = docker_manager._get_friendly_error_message(
        "Error response from daemon: Dial pipe //./pipe/docker_engine: The system cannot find the file specified."
    )
    assert "Docker is not reachable" in msg

    # Test connection error (Mac/Linux connection refused)
    msg = docker_manager._get_friendly_error_message("Connection refused")
    assert "Docker is not reachable" in msg

    # Test permission error - now handled
    msg = docker_manager._get_friendly_error_message("permission denied while trying to connect to the Docker daemon")
    assert "Permissions error" in msg or "Permission denied" in msg

    # Test not found - NOT handled by _get_friendly_error_message (handled by shutil.which in is_docker_available)
    msg = docker_manager._get_friendly_error_message("docker: command not found")
    assert msg is None

    # Test unrelated error
    msg = docker_manager._get_friendly_error_message("Some random error")
    assert msg is None


def test_check_docker_connection_success(docker_manager):
    """Test successful docker connection check."""
    # We need to mock the 'docker' module which is imported inside the method
    mock_docker_module = MagicMock()
    mock_client = MagicMock()
    mock_docker_module.from_env.return_value = mock_client

    # We need to perform the patch before calling the method
    # Since import happens inside, patching sys.modules works
    with patch.dict(sys.modules, {"docker": mock_docker_module}):
        # We need docker_cmd to be set for the check to proceed past the first line
        docker_manager.docker_cmd = "docker"

        result = docker_manager.check_docker_connection()

    assert result["success"] is True
    # Verify our mock was used
    mock_docker_module.from_env.assert_called_once()
    mock_client.ping.assert_called_once()
    mock_client.close.assert_called_once()


def test_check_docker_connection_failure(docker_manager):
    """Test failed docker connection check - both SDK and CLI fallback fail."""
    mock_docker_module = MagicMock()
    mock_docker_module.from_env.side_effect = Exception("Error while fetching server API version")

    # Mock subprocess.run so the CLI fallback also fails
    mock_cli_result = MagicMock()
    mock_cli_result.returncode = 1
    mock_cli_result.stdout = ""
    mock_cli_result.stderr = "Error while fetching server API version"

    with patch.dict(sys.modules, {"docker": mock_docker_module}):
        with patch("subprocess.run", return_value=mock_cli_result):
            docker_manager.docker_cmd = "docker"

            result = docker_manager.check_docker_connection()

    assert result["success"] is False
    assert "Docker is not reachable" in result["error"]


@patch("subprocess.run")
def test_start_services_connection_failure(mock_run, docker_manager):
    """Test start_services with connection failure."""
    docker_manager.docker_cmd = "docker"

    # Mock subprocess failure with specific stderr
    mock_result = MagicMock()
    mock_result.returncode = 1
    mock_result.stdout = ""
    mock_result.stderr = (
        "Error response from daemon: Dial pipe //./pipe/docker_engine: The system cannot find the file specified."
    )
    mock_run.return_value = mock_result

    # We need to mock compose_file exists
    with patch("pathlib.Path.exists", return_value=True):
        # We also need to mock os.environ and app_paths
        with patch.dict(os.environ, {}, clear=True):
            # Since imports are local, we mock what they import
            # from file_brain.core.config import settings
            with patch("file_brain.services.docker_manager.settings") as mock_settings:
                mock_settings.typesense_api_key = "test-key"
                # from file_brain.core.paths import app_paths
                with patch("file_brain.core.paths.app_paths") as mock_paths:
                    mock_paths.get_env_vars.return_value = {}

                    result = docker_manager.start_services()

    assert result["success"] is False
    # The start_services method uses logical OR: friendly_msg or f"Failed..."
    # So if friendly_msg is returned, it is used.
    assert "Docker is not reachable" in result["error"]
