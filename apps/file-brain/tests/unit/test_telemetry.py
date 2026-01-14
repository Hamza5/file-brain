"""
Tests for telemetry device ID generation with fallbacks
"""

import hashlib
from unittest.mock import patch


class TestDeviceIDGeneration:
    """Test device ID generation with various fallback scenarios"""

    @patch("file_brain.core.telemetry.machineid")
    @patch("platformdirs.user_config_dir")
    def test_device_id_primary_method_success(self, mock_config_dir, mock_machineid, tmp_path):
        """Test successful device ID generation using py-machineid AND persistence"""
        from file_brain.core.telemetry import TelemetryManager

        # Mock successful machineid generation
        mock_machineid.hashed_id.return_value = "test-machine-id-hash"

        # Mock config dir
        mock_config_dir.return_value = str(tmp_path)

        # Reset singleton
        TelemetryManager._instance = None

        with patch("file_brain.core.telemetry.settings") as mock_settings:
            mock_settings.posthog_enabled = False  # Disable to avoid PostHog init
            mock_settings.app_name = "test-app"

            manager = TelemetryManager()
            assert manager.distinct_id == "mid_test-machine-id-hash"
            mock_machineid.hashed_id.assert_called_once()

            # Verify persistence
            device_id_file = tmp_path / ".device_id"
            assert device_id_file.exists()
            assert device_id_file.read_text().strip() == "mid_test-machine-id-hash"

    @patch("file_brain.core.telemetry.machineid")
    @patch("socket.gethostname")
    @patch("getpass.getuser")
    @patch("platform.system")
    @patch("platformdirs.user_config_dir")
    def test_device_id_fallback_to_hostname(
        self, mock_config_dir, mock_system, mock_user, mock_hostname, mock_machineid, tmp_path
    ):
        """Test fallback to hostname+username when machineid fails AND persistence"""
        from file_brain.core.telemetry import TelemetryManager

        # Mock machineid failure
        mock_machineid.hashed_id.side_effect = Exception("machineid not available")

        # Mock hostname/platform info
        mock_hostname.return_value = "test-hostname"
        mock_user.return_value = "test-user"
        mock_system.return_value = "Linux"

        # Mock config dir
        mock_config_dir.return_value = str(tmp_path)

        # Reset singleton
        TelemetryManager._instance = None

        with patch("file_brain.core.telemetry.settings") as mock_settings:
            mock_settings.posthog_enabled = False
            mock_settings.app_name = "test-app"

            manager = TelemetryManager()

            # Verify it generated a hash based on hostname
            expected_input = "test-hostname:test-user:Linux"
            expected_hash = hashlib.sha256(expected_input.encode()).hexdigest()
            expected_id = f"sys_{expected_hash}"

            assert manager.distinct_id == expected_id

            # Verify persistence
            device_id_file = tmp_path / ".device_id"
            assert device_id_file.exists()
            assert device_id_file.read_text().strip() == expected_id

    @patch("file_brain.core.telemetry.machineid")
    @patch("socket.gethostname")
    @patch("platformdirs.user_config_dir")
    def test_device_id_fallback_to_random(self, mock_config_dir, mock_hostname, mock_machineid, tmp_path):
        """Test fallback to persistent random ID when both machineid and hostname fail"""
        from file_brain.core.telemetry import TelemetryManager

        # Mock machineid failure
        mock_machineid.hashed_id.side_effect = Exception("machineid not available")

        # Mock hostname failure
        mock_hostname.side_effect = Exception("hostname not available")

        # Use temp directory for config
        mock_config_dir.return_value = str(tmp_path)

        # Reset singleton
        TelemetryManager._instance = None

        with patch("file_brain.core.telemetry.settings") as mock_settings:
            mock_settings.posthog_enabled = False
            mock_settings.app_name = "test-app"

            manager = TelemetryManager()

            # Verify a device ID was generated
            assert manager.distinct_id.startswith("rnd_")
            assert "unknown" not in manager.distinct_id

            # Verify it was persisted
            device_id_file = tmp_path / ".device_id"
            assert device_id_file.exists()
            assert device_id_file.read_text().strip() == manager.distinct_id

    @patch("file_brain.core.telemetry.machineid")
    @patch("platformdirs.user_config_dir")
    def test_device_id_loads_existing_persistent_id(self, mock_config_dir, mock_machineid, tmp_path):
        """Test that existing persistent ID is loaded correctly (Highest Priority)"""
        from file_brain.core.telemetry import TelemetryManager

        # Even if machineid IS available, we should prefer the file
        mock_machineid.hashed_id.return_value = "new-machine-id"

        # Create existing device ID file
        existing_id = "existing-persistent-device-id-hash"
        device_id_file = tmp_path / ".device_id"
        device_id_file.write_text(existing_id)

        # Use temp directory for config
        mock_config_dir.return_value = str(tmp_path)

        # Reset singleton
        TelemetryManager._instance = None

        with patch("file_brain.core.telemetry.settings") as mock_settings:
            mock_settings.posthog_enabled = False
            mock_settings.app_name = "test-app"

            manager = TelemetryManager()

            # Verify it loaded the existing ID, NOT the new machine ID
            assert manager.distinct_id == existing_id
            # machineid should not be called if file exists
            mock_machineid.hashed_id.assert_not_called()

    @patch("file_brain.core.telemetry.machineid")
    @patch("socket.gethostname")
    @patch("platformdirs.user_config_dir")
    def test_device_id_ultimate_fallback(self, mock_config_dir, mock_hostname, mock_machineid):
        """Test ultimate fallback to 'unknown-device-error' when all methods fail"""
        from file_brain.core.telemetry import TelemetryManager

        # Mock all methods to fail
        mock_config_dir.side_effect = Exception("config dir not available")

        # Reset singleton
        TelemetryManager._instance = None

        with patch("file_brain.core.telemetry.settings") as mock_settings:
            mock_settings.posthog_enabled = False
            mock_settings.app_name = "test-app"

            manager = TelemetryManager()

            # Verify it fell back to unknown-device-error
            assert manager.distinct_id == "err_critical_failure"

    def test_device_id_is_deterministic(self, tmp_path):
        """Test that device ID generation is deterministic across multiple calls"""
        from file_brain.core.telemetry import TelemetryManager

        # Need to patch updated config dir for persistence
        with patch("platformdirs.user_config_dir", return_value=str(tmp_path)):
            # Reset singleton
            TelemetryManager._instance = None

            with patch("file_brain.core.telemetry.settings") as mock_settings:
                mock_settings.posthog_enabled = False
                mock_settings.app_name = "test-app"

                manager1 = TelemetryManager()
                device_id_1 = manager1.distinct_id

                # Reset singleton again
                TelemetryManager._instance = None

                manager2 = TelemetryManager()
                device_id_2 = manager2.distinct_id

                # Should be the same (deterministic)
                assert device_id_1 == device_id_2
