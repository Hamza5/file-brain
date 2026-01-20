from unittest.mock import mock_open, patch


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
