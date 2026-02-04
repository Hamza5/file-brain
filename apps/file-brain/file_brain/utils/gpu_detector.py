"""
GPU Detection Utility

Detects NVIDIA GPU availability and Docker runtime support for Typesense GPU mode.
"""

import logging
import platform
import subprocess
from typing import Dict

logger = logging.getLogger(__name__)


def is_nvidia_gpu_available() -> bool:
    """
    Check if an NVIDIA GPU is available on the system.

    Returns:
        bool: True if nvidia-smi command succeeds, False otherwise
    """
    try:
        # Determine nvidia-smi command based on platform
        nvidia_smi_cmd = "nvidia-smi.exe" if platform.system() == "Windows" else "nvidia-smi"

        # Run nvidia-smi with a timeout to avoid hanging
        result = subprocess.run(
            [nvidia_smi_cmd],
            capture_output=True,
            text=True,
            timeout=5,  # 5 second timeout
            check=False,
        )

        if result.returncode == 0:
            logger.debug("NVIDIA GPU detected via nvidia-smi")
            return True
        else:
            logger.debug(f"nvidia-smi failed with return code {result.returncode}")
            return False

    except FileNotFoundError:
        logger.debug("nvidia-smi not found - no NVIDIA GPU drivers installed")
        return False
    except subprocess.TimeoutExpired:
        logger.warning("nvidia-smi command timed out")
        return False
    except Exception as e:
        logger.debug(f"Failed to check for NVIDIA GPU: {type(e).__name__}: {e}")
        return False


def is_nvidia_docker_runtime_available() -> bool:
    """
    Check if NVIDIA Container Runtime is available for Docker.

    Checks for both:
    1. NVIDIA runtime in docker runtimes list
    2. NVIDIA CDI (Container Device Interface) support

    Returns:
        bool: True if NVIDIA runtime or CDI is available, False otherwise
    """
    try:
        # Check docker info for nvidia runtime or CDI support
        result = subprocess.run(
            ["docker", "info"],
            capture_output=True,
            text=True,
            timeout=5,
            check=False,
        )

        if result.returncode == 0:
            output_lower = result.stdout.lower()

            # Check for nvidia runtime in Runtimes section
            if "nvidia" in output_lower:
                logger.debug("NVIDIA Docker runtime or CDI detected")
                return True
            else:
                logger.debug("NVIDIA Docker runtime/CDI not found in docker info")
                return False
        else:
            logger.debug(f"docker info failed with return code {result.returncode}")
            return False

    except FileNotFoundError:
        logger.debug("docker command not found")
        return False
    except subprocess.TimeoutExpired:
        logger.warning("docker info command timed out")
        return False
    except Exception as e:
        logger.debug(f"Failed to check for NVIDIA Docker runtime: {type(e).__name__}: {e}")
        return False


def should_use_gpu_mode() -> bool:
    """
    Determine if GPU mode should be enabled for Typesense.

    Respects FILEBRAIN_GPU_MODE environment variable:
    - 'auto' (default): Auto-detect GPU availability
    - 'force-gpu': Always return True (fails if GPU not available)
    - 'force-cpu': Always return False

    GPU mode requires both (when auto-detecting):
    1. NVIDIA GPU hardware (nvidia-smi available)
    2. NVIDIA Docker runtime (docker runtime supports nvidia)

    Returns:
        bool: True if GPU mode should be used, False otherwise
    """
    from file_brain.core.config import settings

    gpu_mode = settings.gpu_mode.lower()

    if gpu_mode == "force-gpu":
        logger.info("🎮 GPU mode forced via FILEBRAIN_GPU_MODE=force-gpu")
        return True
    elif gpu_mode == "force-cpu":
        logger.info("💻 CPU mode forced via FILEBRAIN_GPU_MODE=force-cpu")
        return False
    elif gpu_mode == "auto":
        # Auto-detect GPU availability
        has_gpu = is_nvidia_gpu_available()
        has_runtime = is_nvidia_docker_runtime_available()

        if has_gpu and has_runtime:
            logger.info("✅ GPU mode enabled - NVIDIA GPU and Docker runtime detected")
            return True
        elif has_gpu and not has_runtime:
            logger.info("⚠️  GPU mode disabled - NVIDIA GPU found but Docker runtime missing")
            logger.info("   Install NVIDIA Container Toolkit to enable GPU acceleration")
            return False
        elif not has_gpu and has_runtime:
            logger.debug("GPU mode disabled - NVIDIA runtime available but no GPU detected")
            return False
        else:
            logger.debug("GPU mode disabled - no NVIDIA GPU or runtime detected")
            return False
    else:
        logger.warning(f"Invalid FILEBRAIN_GPU_MODE='{gpu_mode}', defaulting to auto-detect")
        # Fall back to auto-detect
        has_gpu = is_nvidia_gpu_available()
        has_runtime = is_nvidia_docker_runtime_available()
        return has_gpu and has_runtime


def get_gpu_info() -> Dict[str, bool]:
    """
    Get detailed GPU availability information for telemetry and debugging.

    Returns:
        dict: Dictionary with GPU detection results
    """
    return {
        "has_gpu_hardware": is_nvidia_gpu_available(),
        "has_nvidia_runtime": is_nvidia_docker_runtime_available(),
        "gpu_mode_enabled": should_use_gpu_mode(),
    }
