"""
Tests for telemetry device ID generation with fallbacks
"""

import hashlib
from unittest.mock import patch


class TestDeviceIDGeneration:
    """Test device ID generation with various fallback scenarios"""

    @patch("file_brain.core.telemetry.machineid")
    def test_device_id_primary_method_success(self, mock_machineid):
        """Test successful device ID generation using py-machineid"""
        from file_brain.core.telemetry import TelemetryManager

        # Mock successful machineid generation
        mock_machineid.hashed_id.return_value = "test-machine-id-hash"

        # Reset singleton
        TelemetryManager._instance = None

        with patch("file_brain.core.telemetry.settings") as mock_settings:
            mock_settings.posthog_enabled = False  # Disable to avoid PostHog init
            mock_settings.app_name = "test-app"

            manager = TelemetryManager()
            assert manager.distinct_id == "test-machine-id-hash"
            mock_machineid.hashed_id.assert_called_once()

    @patch("file_brain.core.telemetry.machineid")
    @patch("socket.gethostname")
    @patch("platform.node")
    @patch("platform.system")
    def test_device_id_fallback_to_hostname(self, mock_system, mock_node, mock_hostname, mock_machineid):
        """Test fallback to hostname+username when machineid fails"""
        from file_brain.core.telemetry import TelemetryManager

        # Mock machineid failure
        mock_machineid.hashed_id.side_effect = Exception("machineid not available")

        # Mock hostname/platform info
        mock_hostname.return_value = "test-hostname"
        mock_node.return_value = "test-node"
        mock_system.return_value = "Linux"

        # Reset singleton
        TelemetryManager._instance = None

        with patch("file_brain.core.telemetry.settings") as mock_settings:
            mock_settings.posthog_enabled = False
            mock_settings.app_name = "test-app"

            manager = TelemetryManager()

            # Verify it generated a hash based on hostname
            expected_input = "test-hostname:test-node:Linux"
            expected_hash = hashlib.sha256(expected_input.encode()).hexdigest()
            assert manager.distinct_id == expected_hash

    @patch("file_brain.core.telemetry.machineid")
    @patch("socket.gethostname")
    @patch("platformdirs.user_config_dir")
    def test_device_id_fallback_to_persistent_random(self, mock_config_dir, mock_hostname, mock_machineid, tmp_path):
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
            assert manager.distinct_id != "unknown-device"
            assert len(manager.distinct_id) == 64  # SHA256 hex length

            # Verify it was persisted
            device_id_file = tmp_path / ".device_id"
            assert device_id_file.exists()
            assert device_id_file.read_text().strip() == manager.distinct_id

    @patch("file_brain.core.telemetry.machineid")
    @patch("socket.gethostname")
    @patch("platformdirs.user_config_dir")
    def test_device_id_loads_existing_persistent_id(self, mock_config_dir, mock_hostname, mock_machineid, tmp_path):
        """Test that existing persistent ID is loaded correctly"""
        from file_brain.core.telemetry import TelemetryManager

        # Mock machineid failure
        mock_machineid.hashed_id.side_effect = Exception("machineid not available")

        # Mock hostname failure
        mock_hostname.side_effect = Exception("hostname not available")

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

            # Verify it loaded the existing ID
            assert manager.distinct_id == existing_id

    @patch("file_brain.core.telemetry.machineid")
    @patch("socket.gethostname")
    @patch("platformdirs.user_config_dir")
    def test_device_id_ultimate_fallback(self, mock_config_dir, mock_hostname, mock_machineid):
        """Test ultimate fallback to 'unknown-device' when all methods fail"""
        from file_brain.core.telemetry import TelemetryManager

        # Mock all methods to fail
        mock_machineid.hashed_id.side_effect = Exception("machineid not available")
        mock_hostname.side_effect = Exception("hostname not available")
        mock_config_dir.side_effect = Exception("config dir not available")

        # Reset singleton
        TelemetryManager._instance = None

        with patch("file_brain.core.telemetry.settings") as mock_settings:
            mock_settings.posthog_enabled = False
            mock_settings.app_name = "test-app"

            manager = TelemetryManager()

            # Verify it fell back to unknown-device
            assert manager.distinct_id == "unknown-device"

    def test_device_id_is_deterministic(self):
        """Test that device ID generation is deterministic across multiple calls"""
        from file_brain.core.telemetry import TelemetryManager

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
