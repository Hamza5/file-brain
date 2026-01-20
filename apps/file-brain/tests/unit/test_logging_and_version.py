import importlib
import logging
import os
import sys
from unittest.mock import ANY, mock_open, patch

import pytest


# Helper to reload flaskwebgui to re-run top-level logic
def reload_flaskwebgui():
    # Mock webbrowser to prevent "could not locate runnable browser" error during import
    with patch("webbrowser.get"):
        if "file_brain.lib.flaskwebgui" in sys.modules:
            importlib.reload(sys.modules["file_brain.lib.flaskwebgui"])
        else:
            pass


class TestFlaskWebGUILogging:
    @pytest.fixture(autouse=True)
    def clean_flags(self):
        # Reset relevant flags before each test
        with patch.dict(os.environ, clear=True):
            yield

    def test_default_logging_in_dev_mode(self):
        """Test defaults to DEBUG when not frozen and DEBUG=true (default)"""
        with patch("sys.frozen", False, create=True):
            # No DEBUG env var -> defaults to "true" in code -> is_debug=True
            reload_flaskwebgui()

            # We can't easily check the config level directly as basicConfig logic is complex to probe
            # if already configured, but we can check what logic WOULD have selected by inspecting the mocks
            # if we extracted it, or by inspecting the logger's effective level if basicConfig worked.
            # Instead, let's verify the logic flow by mocking logging.basicConfig

            with patch("logging.basicConfig") as mock_basic_config:
                reload_flaskwebgui()
                # Verify called with DEBUG
                mock_basic_config.assert_called_with(level=logging.DEBUG, format=ANY)

    def test_logging_in_packaged_mode(self):
        """Test defaults to INFO when frozen"""
        with patch("sys.frozen", True, create=True):
            with patch("logging.basicConfig") as mock_basic_config:
                reload_flaskwebgui()
                mock_basic_config.assert_called_with(level=logging.INFO, format=ANY)

    def test_logging_in_prod_mode_env(self):
        """Test defaults to INFO when DEBUG=false"""
        with patch("sys.frozen", False, create=True), patch.dict(os.environ, {"DEBUG": "false"}):
            with patch("logging.basicConfig") as mock_basic_config:
                reload_flaskwebgui()
                mock_basic_config.assert_called_with(level=logging.INFO, format=ANY)

    def test_explicit_override_packaged(self):
        """Test explicit FLASKWEBGUI_LOG_LEVEL overrides default even in packaged mode"""
        with patch("sys.frozen", True, create=True), patch.dict(os.environ, {"FLASKWEBGUI_LOG_LEVEL": "ERROR"}):
            with patch("logging.basicConfig") as mock_basic_config:
                reload_flaskwebgui()
                mock_basic_config.assert_called_with(level=logging.ERROR, format=ANY)


class TestAppVersionRetrieval:
    def test_prioritize_pyproject_toml(self):
        """Test that pyproject.toml is read if it exists"""
        mock_toml_content = b'[project]\nname = "file-brain"\nversion = "1.2.3"'

        # Mock existence of pyproject.toml
        with patch("os.path.exists", return_value=True):
            # Mock file opening
            with patch("builtins.open", mock_open(read_data=mock_toml_content)):
                # Mock importlib to ensure it is NOT used (or if used, result is ignored)
                with patch("importlib.metadata.version", return_value="9.9.9"):
                    from file_brain.core.app_info import get_app_info

                    info = get_app_info()
                    assert info["version"] == "1.2.3"

    def test_fallback_to_importlib_when_file_missing(self):
        """Test fallback to importlib.metadata when pyproject.toml is missing"""
        # Mock pyproject.toml NOT existing
        with patch("os.path.exists", return_value=False):
            with patch("importlib.metadata.version", return_value="4.5.6") as mock_version:
                from file_brain.core.app_info import get_app_info

                info = get_app_info()
                assert info["version"] == "4.5.6"
                mock_version.assert_called_with("file-brain")

    def test_error_handling(self):
        """Test fallback to error string when both fail"""
        with patch("os.path.exists", return_value=False):
            with patch("importlib.metadata.version", side_effect=ImportError):
                from file_brain.core.app_info import get_app_info

                info = get_app_info()
                assert "error" in info["version"]
