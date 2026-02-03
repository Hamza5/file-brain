"""
Unit tests for GPU detection utility
"""

import subprocess
from unittest.mock import MagicMock, patch

from file_brain.utils.gpu_detector import (
    get_gpu_info,
    is_nvidia_docker_runtime_available,
    is_nvidia_gpu_available,
    should_use_gpu_mode,
)


class TestNvidiaGPUDetection:
    """Tests for NVIDIA GPU hardware detection"""

    @patch("file_brain.utils.gpu_detector.subprocess.run")
    def test_gpu_available_success(self, mock_run):
        """Test successful GPU detection via nvidia-smi"""
        mock_run.return_value = MagicMock(returncode=0, stdout="GPU info", stderr="")

        assert is_nvidia_gpu_available() is True
        mock_run.assert_called_once()
        assert mock_run.call_args[0][0][0] in ["nvidia-smi", "nvidia-smi.exe"]

    @patch("file_brain.utils.gpu_detector.subprocess.run")
    def test_gpu_not_available_command_fails(self, mock_run):
        """Test GPU detection when nvidia-smi fails"""
        mock_run.return_value = MagicMock(returncode=1, stdout="", stderr="Error")

        assert is_nvidia_gpu_available() is False

    @patch("file_brain.utils.gpu_detector.subprocess.run")
    def test_gpu_not_available_command_not_found(self, mock_run):
        """Test GPU detection when nvidia-smi is not installed"""
        mock_run.side_effect = FileNotFoundError("nvidia-smi not found")

        assert is_nvidia_gpu_available() is False

    @patch("file_brain.utils.gpu_detector.subprocess.run")
    def test_gpu_detection_timeout(self, mock_run):
        """Test GPU detection handles timeout gracefully"""
        mock_run.side_effect = subprocess.TimeoutExpired("nvidia-smi", 5)

        assert is_nvidia_gpu_available() is False

    @patch("file_brain.utils.gpu_detector.subprocess.run")
    def test_gpu_detection_unexpected_error(self, mock_run):
        """Test GPU detection handles unexpected errors"""
        mock_run.side_effect = RuntimeError("Unexpected error")

        assert is_nvidia_gpu_available() is False

    @patch("file_brain.utils.gpu_detector.platform.system")
    @patch("file_brain.utils.gpu_detector.subprocess.run")
    def test_gpu_detection_windows(self, mock_run, mock_platform):
        """Test GPU detection uses correct command on Windows"""
        mock_platform.return_value = "Windows"
        mock_run.return_value = MagicMock(returncode=0)

        is_nvidia_gpu_available()

        # Should use nvidia-smi.exe on Windows
        assert mock_run.call_args[0][0][0] == "nvidia-smi.exe"

    @patch("file_brain.utils.gpu_detector.platform.system")
    @patch("file_brain.utils.gpu_detector.subprocess.run")
    def test_gpu_detection_linux(self, mock_run, mock_platform):
        """Test GPU detection uses correct command on Linux"""
        mock_platform.return_value = "Linux"
        mock_run.return_value = MagicMock(returncode=0)

        is_nvidia_gpu_available()

        # Should use nvidia-smi on Linux
        assert mock_run.call_args[0][0][0] == "nvidia-smi"


class TestNvidiaDockerRuntimeDetection:
    """Tests for NVIDIA Docker runtime/CDI detection"""

    @patch("file_brain.utils.gpu_detector.subprocess.run")
    def test_nvidia_runtime_available_legacy(self, mock_run):
        """Test detection of legacy nvidia-docker runtime"""
        mock_run.return_value = MagicMock(
            returncode=0,
            stdout="Runtimes: runc nvidia nvidia-experimental",
            stderr="",
        )

        assert is_nvidia_docker_runtime_available() is True

    @patch("file_brain.utils.gpu_detector.subprocess.run")
    def test_nvidia_runtime_available_cdi(self, mock_run):
        """Test detection of modern CDI support"""
        mock_run.return_value = MagicMock(
            returncode=0,
            stdout="""
            Runtimes: runc io.containerd.runc.v2
            CDI Devices:
              cdi: nvidia.com/gpu=0
              cdi: nvidia.com/gpu=all
            """,
            stderr="",
        )

        assert is_nvidia_docker_runtime_available() is True

    @patch("file_brain.utils.gpu_detector.subprocess.run")
    def test_nvidia_runtime_not_available(self, mock_run):
        """Test when NVIDIA runtime is not available"""
        mock_run.return_value = MagicMock(
            returncode=0,
            stdout="Runtimes: runc io.containerd.runc.v2",
            stderr="",
        )

        assert is_nvidia_docker_runtime_available() is False

    @patch("file_brain.utils.gpu_detector.subprocess.run")
    def test_docker_command_not_found(self, mock_run):
        """Test when docker command is not installed"""
        mock_run.side_effect = FileNotFoundError("docker not found")

        assert is_nvidia_docker_runtime_available() is False

    @patch("file_brain.utils.gpu_detector.subprocess.run")
    def test_docker_info_fails(self, mock_run):
        """Test when docker info command fails"""
        mock_run.return_value = MagicMock(returncode=1, stdout="", stderr="Error")

        assert is_nvidia_docker_runtime_available() is False

    @patch("file_brain.utils.gpu_detector.subprocess.run")
    def test_docker_info_timeout(self, mock_run):
        """Test docker info timeout handling"""
        mock_run.side_effect = subprocess.TimeoutExpired("docker", 5)

        assert is_nvidia_docker_runtime_available() is False

    @patch("file_brain.utils.gpu_detector.subprocess.run")
    def test_docker_runtime_case_insensitive(self, mock_run):
        """Test that detection is case-insensitive"""
        mock_run.return_value = MagicMock(
            returncode=0,
            stdout="Runtimes: runc NVIDIA",  # Uppercase NVIDIA
            stderr="",
        )

        assert is_nvidia_docker_runtime_available() is True


class TestGPUModeDecision:
    """Tests for GPU mode decision logic"""

    @patch("file_brain.utils.gpu_detector.is_nvidia_docker_runtime_available")
    @patch("file_brain.utils.gpu_detector.is_nvidia_gpu_available")
    def test_gpu_mode_enabled_both_available(self, mock_gpu, mock_runtime):
        """Test GPU mode enabled when both GPU and runtime are available"""
        mock_gpu.return_value = True
        mock_runtime.return_value = True

        assert should_use_gpu_mode() is True

    @patch("file_brain.utils.gpu_detector.is_nvidia_docker_runtime_available")
    @patch("file_brain.utils.gpu_detector.is_nvidia_gpu_available")
    def test_gpu_mode_disabled_no_gpu(self, mock_gpu, mock_runtime):
        """Test GPU mode disabled when GPU is not available"""
        mock_gpu.return_value = False
        mock_runtime.return_value = True

        assert should_use_gpu_mode() is False

    @patch("file_brain.utils.gpu_detector.is_nvidia_docker_runtime_available")
    @patch("file_brain.utils.gpu_detector.is_nvidia_gpu_available")
    def test_gpu_mode_disabled_no_runtime(self, mock_gpu, mock_runtime):
        """Test GPU mode disabled when runtime is not available"""
        mock_gpu.return_value = True
        mock_runtime.return_value = False

        assert should_use_gpu_mode() is False

    @patch("file_brain.utils.gpu_detector.is_nvidia_docker_runtime_available")
    @patch("file_brain.utils.gpu_detector.is_nvidia_gpu_available")
    def test_gpu_mode_disabled_neither_available(self, mock_gpu, mock_runtime):
        """Test GPU mode disabled when neither GPU nor runtime are available"""
        mock_gpu.return_value = False
        mock_runtime.return_value = False

        assert should_use_gpu_mode() is False


class TestGetGPUInfo:
    """Tests for get_gpu_info utility function"""

    @patch("file_brain.utils.gpu_detector.should_use_gpu_mode")
    @patch("file_brain.utils.gpu_detector.is_nvidia_docker_runtime_available")
    @patch("file_brain.utils.gpu_detector.is_nvidia_gpu_available")
    def test_get_gpu_info_all_available(self, mock_gpu, mock_runtime, mock_mode):
        """Test get_gpu_info when all GPU features are available"""
        mock_gpu.return_value = True
        mock_runtime.return_value = True
        mock_mode.return_value = True

        info = get_gpu_info()

        assert info == {
            "has_gpu_hardware": True,
            "has_nvidia_runtime": True,
            "gpu_mode_enabled": True,
        }

    @patch("file_brain.utils.gpu_detector.should_use_gpu_mode")
    @patch("file_brain.utils.gpu_detector.is_nvidia_docker_runtime_available")
    @patch("file_brain.utils.gpu_detector.is_nvidia_gpu_available")
    def test_get_gpu_info_none_available(self, mock_gpu, mock_runtime, mock_mode):
        """Test get_gpu_info when no GPU features are available"""
        mock_gpu.return_value = False
        mock_runtime.return_value = False
        mock_mode.return_value = False

        info = get_gpu_info()

        assert info == {
            "has_gpu_hardware": False,
            "has_nvidia_runtime": False,
            "gpu_mode_enabled": False,
        }

    @patch("file_brain.utils.gpu_detector.should_use_gpu_mode")
    @patch("file_brain.utils.gpu_detector.is_nvidia_docker_runtime_available")
    @patch("file_brain.utils.gpu_detector.is_nvidia_gpu_available")
    def test_get_gpu_info_partial_availability(self, mock_gpu, mock_runtime, mock_mode):
        """Test get_gpu_info when GPU is available but runtime is not"""
        mock_gpu.return_value = True
        mock_runtime.return_value = False
        mock_mode.return_value = False

        info = get_gpu_info()

        assert info == {
            "has_gpu_hardware": True,
            "has_nvidia_runtime": False,
            "gpu_mode_enabled": False,
        }
