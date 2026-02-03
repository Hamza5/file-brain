"""
Tests for telemetry device ID generation with fallbacks
"""

import hashlib
from unittest.mock import MagicMock, patch


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


class TestEnvironmentDetection:
    """Test environment detection for install_type tracking"""

    @patch("file_brain.core.telemetry.machineid", None)
    @patch("platformdirs.user_config_dir")
    def test_development_environment(self, mock_config_dir, tmp_path):
        """Test that debug mode is detected as development"""
        from file_brain.core.telemetry import TelemetryManager

        mock_config_dir.return_value = str(tmp_path)
        TelemetryManager._instance = None

        with patch("file_brain.core.telemetry.settings") as mock_settings:
            mock_settings.posthog_enabled = False
            mock_settings.app_name = "test-app"
            mock_settings.debug = True  # Debug mode enabled

            manager = TelemetryManager()
            assert manager.environment == "development"

    @patch("file_brain.core.telemetry.machineid", None)
    @patch("platformdirs.user_config_dir")
    def test_packaged_pip_installed(self, mock_config_dir, tmp_path):
        """Test that pip-installed packages are detected as packaged"""
        from file_brain.core.telemetry import TelemetryManager

        mock_config_dir.return_value = str(tmp_path)
        TelemetryManager._instance = None

        with patch("file_brain.core.telemetry.settings") as mock_settings:
            mock_settings.posthog_enabled = False
            mock_settings.app_name = "test-app"
            mock_settings.debug = False  # Not in debug mode

            # Mock file_brain module to appear as if installed in site-packages
            mock_file_brain = MagicMock()
            mock_file_brain.__file__ = "/usr/lib/python3.11/site-packages/file_brain/__init__.py"

            with patch.dict("sys.modules", {"file_brain": mock_file_brain}):
                manager = TelemetryManager()
                assert manager.environment == "packaged"

    @patch("file_brain.core.telemetry.machineid", None)
    @patch("platformdirs.user_config_dir")
    def test_packaged_frozen_executable(self, mock_config_dir, tmp_path):
        """Test that PyInstaller frozen executables are detected as packaged"""
        from file_brain.core.telemetry import TelemetryManager

        mock_config_dir.return_value = str(tmp_path)
        TelemetryManager._instance = None

        with patch("file_brain.core.telemetry.settings") as mock_settings:
            mock_settings.posthog_enabled = False
            mock_settings.app_name = "test-app"
            mock_settings.debug = False  # Not in debug mode

            # Mock sys.frozen = True for PyInstaller
            with patch("file_brain.core.telemetry.sys") as mock_sys:
                mock_sys.frozen = True

                manager = TelemetryManager()
                assert manager.environment == "packaged"

    @patch("file_brain.core.telemetry.machineid", None)
    @patch("platformdirs.user_config_dir")
    def test_production_environment(self, mock_config_dir, tmp_path):
        """Test that non-frozen, non-pip, non-debug installs are production"""
        from file_brain.core.telemetry import TelemetryManager

        mock_config_dir.return_value = str(tmp_path)
        TelemetryManager._instance = None

        with patch("file_brain.core.telemetry.settings") as mock_settings:
            mock_settings.posthog_enabled = False
            mock_settings.app_name = "test-app"
            mock_settings.debug = False  # Not in debug mode

            # Mock file_brain module NOT in site-packages (e.g., running from source in production)
            mock_file_brain = MagicMock()
            mock_file_brain.__file__ = "/home/user/file-brain/apps/file-brain/file_brain/__init__.py"

            with patch.dict("sys.modules", {"file_brain": mock_file_brain}):
                manager = TelemetryManager()
                assert manager.environment == "production"

    @patch("file_brain.core.telemetry.machineid", None)
    @patch("platformdirs.user_config_dir")
    def test_debug_overrides_pip_install(self, mock_config_dir, tmp_path):
        """Test that debug mode takes precedence over pip installation detection"""
        from file_brain.core.telemetry import TelemetryManager

        mock_config_dir.return_value = str(tmp_path)
        TelemetryManager._instance = None

        with patch("file_brain.core.telemetry.settings") as mock_settings:
            mock_settings.posthog_enabled = False
            mock_settings.app_name = "test-app"
            mock_settings.debug = True  # Debug mode enabled

            # Even if installed in site-packages, debug mode should win
            mock_file_brain = MagicMock()
            mock_file_brain.__file__ = "/usr/lib/python3.11/site-packages/file_brain/__init__.py"

            with patch.dict("sys.modules", {"file_brain": mock_file_brain}):
                manager = TelemetryManager()
                assert manager.environment == "development"


class TestGPUDetection:
    """Test GPU detection integration in telemetry"""

    @patch("file_brain.core.telemetry.machineid", None)
    @patch("platformdirs.user_config_dir")
    @patch("file_brain.utils.gpu_detector.should_use_gpu_mode")
    @patch("file_brain.utils.gpu_detector.is_nvidia_docker_runtime_available")
    @patch("file_brain.utils.gpu_detector.is_nvidia_gpu_available")
    def test_gpu_info_all_available(self, mock_gpu, mock_runtime, mock_mode, mock_config_dir, tmp_path):
        """Test GPU detection when all GPU features are available"""
        from file_brain.core.telemetry import TelemetryManager

        mock_config_dir.return_value = str(tmp_path)
        mock_gpu.return_value = True
        mock_runtime.return_value = True
        mock_mode.return_value = True

        TelemetryManager._instance = None

        with patch("file_brain.core.telemetry.settings") as mock_settings:
            mock_settings.posthog_enabled = False
            mock_settings.app_name = "test-app"

            manager = TelemetryManager()
            gpu_info = manager._detect_gpu_info()

            assert gpu_info == {
                "has_gpu_hardware": True,
                "has_nvidia_runtime": True,
                "gpu_mode_enabled": True,
            }

    @patch("file_brain.core.telemetry.machineid", None)
    @patch("platformdirs.user_config_dir")
    @patch("file_brain.utils.gpu_detector.should_use_gpu_mode")
    @patch("file_brain.utils.gpu_detector.is_nvidia_docker_runtime_available")
    @patch("file_brain.utils.gpu_detector.is_nvidia_gpu_available")
    def test_gpu_info_none_available(self, mock_gpu, mock_runtime, mock_mode, mock_config_dir, tmp_path):
        """Test GPU detection when no GPU features are available"""
        from file_brain.core.telemetry import TelemetryManager

        mock_config_dir.return_value = str(tmp_path)
        mock_gpu.return_value = False
        mock_runtime.return_value = False
        mock_mode.return_value = False

        TelemetryManager._instance = None

        with patch("file_brain.core.telemetry.settings") as mock_settings:
            mock_settings.posthog_enabled = False
            mock_settings.app_name = "test-app"

            manager = TelemetryManager()
            gpu_info = manager._detect_gpu_info()

            assert gpu_info == {
                "has_gpu_hardware": False,
                "has_nvidia_runtime": False,
                "gpu_mode_enabled": False,
            }

    @patch("file_brain.core.telemetry.machineid", None)
    @patch("platformdirs.user_config_dir")
    @patch("file_brain.utils.gpu_detector.should_use_gpu_mode")
    @patch("file_brain.utils.gpu_detector.is_nvidia_docker_runtime_available")
    @patch("file_brain.utils.gpu_detector.is_nvidia_gpu_available")
    def test_gpu_info_partial_availability(self, mock_gpu, mock_runtime, mock_mode, mock_config_dir, tmp_path):
        """Test GPU detection when GPU is available but runtime is not"""
        from file_brain.core.telemetry import TelemetryManager

        mock_config_dir.return_value = str(tmp_path)
        mock_gpu.return_value = True
        mock_runtime.return_value = False
        mock_mode.return_value = False

        TelemetryManager._instance = None

        with patch("file_brain.core.telemetry.settings") as mock_settings:
            mock_settings.posthog_enabled = False
            mock_settings.app_name = "test-app"

            manager = TelemetryManager()
            gpu_info = manager._detect_gpu_info()

            assert gpu_info == {
                "has_gpu_hardware": True,
                "has_nvidia_runtime": False,
                "gpu_mode_enabled": False,
            }

    @patch("file_brain.core.telemetry.machineid", None)
    @patch("platformdirs.user_config_dir")
    @patch("file_brain.utils.gpu_detector.should_use_gpu_mode")
    @patch("file_brain.utils.gpu_detector.is_nvidia_docker_runtime_available")
    @patch("file_brain.utils.gpu_detector.is_nvidia_gpu_available")
    def test_gpu_detection_error_handling(self, mock_gpu, mock_runtime, mock_mode, mock_config_dir, tmp_path):
        """Test GPU detection handles errors gracefully"""
        from file_brain.core.telemetry import TelemetryManager

        mock_config_dir.return_value = str(tmp_path)
        # Simulate import error or exception
        mock_gpu.side_effect = Exception("GPU detection failed")

        TelemetryManager._instance = None

        with patch("file_brain.core.telemetry.settings") as mock_settings:
            mock_settings.posthog_enabled = False
            mock_settings.app_name = "test-app"

            manager = TelemetryManager()
            gpu_info = manager._detect_gpu_info()

            # Should return all False on error
            assert gpu_info == {
                "has_gpu_hardware": False,
                "has_nvidia_runtime": False,
                "gpu_mode_enabled": False,
            }
