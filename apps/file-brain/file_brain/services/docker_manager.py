"""
Docker Manager Service - Manages docker-compose lifecycle and container monitoring
"""

import os
import shutil
import subprocess
from pathlib import Path
from typing import Dict, List, Optional

from file_brain.core.config import settings
from file_brain.core.logging import logger


class DockerManager:
    """Manages docker-compose services for File Brain"""

    def __init__(self, compose_file_path: Optional[str] = None):
        """
        Initialize Docker Manager

        Args:
            compose_file_path: Path to docker-compose.yml file
        """
        if compose_file_path:
            self.compose_file = Path(compose_file_path)
        else:
            # Locating docker-compose.yml (now consistently in file_brain/docker-compose.yml)
            try:
                from importlib.resources import files

                # Check inside the file_brain package (installed mode or proper package structure)
                pkg_compose = files("file_brain") / "docker-compose.yml"
                if pkg_compose.is_file():
                    self.compose_file = Path(pkg_compose)
                else:
                    # Fallback for dev/source mode
                    # Location: file_brain/services/docker_manager.py -> file_brain/docker-compose.yml
                    # Go up 2 levels: services -> file_brain
                    dev_compose = Path(__file__).parent.parent / "docker-compose.yml"
                    if dev_compose.exists():
                        self.compose_file = dev_compose
                    else:
                        raise FileNotFoundError("docker-compose.yml not found in package resources or source tree")
            except Exception as e:
                # Fallback purely on file path relative to this file
                dev_compose = Path(__file__).parent.parent / "docker-compose.yml"
                if dev_compose.exists():
                    self.compose_file = dev_compose
                else:
                    logger.error(f"Failed to locate docker-compose.yml: {e}")
                    # Last ditch effort (though likely to fail if file is gone)
                    self.compose_file = Path("docker-compose.yml")

        self.docker_cmd = self._detect_docker_command()
        self._log_buffers: Dict[str, List[str]] = {}

    def _detect_docker_command(self) -> Optional[str]:
        """
        Detect available docker command (docker or podman)

        Returns:
            Command name ('docker' or 'podman') or None if not found
        """
        # Check for docker first
        if shutil.which("docker"):
            return "docker"
        # Check for podman as fallback
        elif shutil.which("podman"):
            return "podman"
        return None

    def is_docker_available(self) -> bool:
        """Check if Docker or Podman is installed"""
        return self.docker_cmd is not None

    def get_docker_info(self) -> Dict[str, str]:
        """
        Get information about the docker installation

        Returns:
            Dictionary with docker info
        """
        if not self.docker_cmd:
            return {"available": False, "command": None, "error": "Docker/Podman not found"}

        try:
            # Get docker version
            result = subprocess.run(
                [self.docker_cmd, "--version"],
                capture_output=True,
                text=True,
                timeout=5,
            )

            version = result.stdout.strip() if result.returncode == 0 else "Unknown"

            return {
                "available": True,
                "command": self.docker_cmd,
                "version": version,
                "compose_file": str(self.compose_file),
                "compose_exists": self.compose_file.exists(),
            }
        except Exception as e:
            logger.error(f"Error getting docker info: {e}")
            return {
                "available": False,
                "command": self.docker_cmd,
                "error": str(e),
            }

    def _get_images_from_compose(self) -> List[str]:
        """
        Parse docker-compose.yml to extract image names

        Returns:
            List of image names
        """
        if not self.compose_file.exists():
            return []

        try:
            import yaml

            with open(self.compose_file) as f:
                compose_data = yaml.safe_load(f)

            images = []
            services = compose_data.get("services", {})
            for service_name, service_config in services.items():
                if "image" in service_config:
                    images.append(service_config["image"])
            return images
        except Exception as e:
            logger.error(f"Error parsing docker-compose.yml: {e}")
            return []

    def check_required_images(self) -> Dict[str, any]:
        """
        Check if all required images from docker-compose are present locally

        Returns:
            Dictionary with status of images
        """
        if not self.docker_cmd:
            return {"success": False, "error": "Docker/Podman not found"}

        images = self._get_images_from_compose()
        if not images:
            return {"success": False, "error": "No images found in docker-compose.yml"}

        missing_images = []
        present_images = []

        try:
            # Get list of local images
            # format: repository:tag
            if self.docker_cmd == "docker":
                cmd = [self.docker_cmd, "images", "--format", "{{.Repository}}:{{.Tag}}"]
            else:
                cmd = ["podman", "images", "--format", "{{.Repository}}:{{.Tag}}"]

            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=10,
            )

            if result.returncode != 0:
                logger.error(f"Failed to list images: {result.stderr}")
                return {"success": False, "error": f"Failed to list images: {result.stderr}"}

            local_images = set(result.stdout.strip().split("\n"))

            # Also add "latest" tag implicit handling if needed, but safer to match exactly what's in compose
            # Some compose files use short names, docker images might output fulll names.
            # We'll do a basic check.

            for required_image in images:
                # Handle cases where :latest might be implicit in one place but explicit in another
                # But typically docker-compose pulls what is specified.

                # Check for exact match first
                found = False
                if required_image in local_images:
                    found = True

                # If not found, try to match loosely (e.g. if image has no tag, assume latest)
                if not found and ":" not in required_image:
                    if f"{required_image}:latest" in local_images:
                        found = True

                if found:
                    present_images.append(required_image)
                else:
                    missing_images.append(required_image)

            return {
                "success": True,
                "all_present": len(missing_images) == 0,
                "missing": missing_images,
                "present": present_images,
                "total_required": len(images),
            }

        except Exception as e:
            logger.error(f"Error checking required images: {e}")
            return {"success": False, "error": str(e)}

    def pull_images_with_progress(self, progress_callback=None):
        """
        Pull docker images with real progress tracking using Docker SDK

        Args:
            progress_callback: Callback function(data) where data contains:
                - image: image being pulled
                - layer_id: layer being downloaded
                - status: current status (Pulling, Downloading, Extracting, etc.)
                - current: bytes downloaded (for progress calculation)
                - total: total bytes (for progress calculation)
                - progress_percent: calculated percentage for current layer
                - overall_percent: overall progress across all layers

        Yields progress events for SSE streaming
        """
        if not self.docker_cmd:
            if progress_callback:
                progress_callback({"error": "Docker/Podman not found. Please install Docker or Podman to continue."})
            return {"success": False, "error": "Docker/Podman not found"}

        if not self.compose_file.exists():
            if progress_callback:
                progress_callback({"error": f"docker-compose.yml not found at {self.compose_file}"})
            return {"success": False, "error": "docker-compose.yml not found"}

        images = self._get_images_from_compose()
        if not images:
            if progress_callback:
                progress_callback({"error": "No images found in docker-compose.yml"})
            return {"success": False, "error": "No images found"}

        try:
            # Use appropriate SDK based on detected command
            if self.docker_cmd == "docker":
                return self._pull_images_docker_sdk(images, progress_callback)
            else:
                return self._pull_images_podman_sdk(images, progress_callback)

        except ImportError as e:
            logger.warning(f"SDK not available ({e}), falling back to CLI")
            return self._pull_images_cli(images, progress_callback)

        except Exception as e:
            logger.error(f"Error pulling images: {e}")
            if progress_callback:
                progress_callback({"error": str(e)})
            return {"success": False, "error": str(e)}

    def _pull_images_docker_sdk(self, images: List[str], progress_callback=None):
        """Pull images using Docker SDK with progress streaming (non-blocking)"""
        import threading
        import time
        from queue import Queue as ThreadQueue

        import docker

        # Thread-safe queue for progress events
        progress_queue = ThreadQueue()

        def pull_in_thread():
            """Run synchronous Docker SDK pull in thread to avoid blocking event loop"""
            try:
                client = docker.from_env()
                total_images = len(images)
                completed_images = 0

                for image in images:
                    logger.info(f"Pulling image (Docker SDK): {image}")
                    progress_queue.put({"status": "Starting", "image": image, "message": f"Pulling {image}..."})

                    layer_progress = {}

                    try:
                        # This is synchronous and blocks, but we're in a thread so it's OK
                        for event in client.api.pull(image, stream=True, decode=True):
                            layer_id = event.get("id", "")
                            status = event.get("status", "")
                            progress_detail = event.get("progressDetail", {})

                            current = progress_detail.get("current", 0)
                            total = progress_detail.get("total", 0)

                            if layer_id and total > 0:
                                layer_progress[layer_id] = {"current": current, "total": total}

                            total_bytes = sum(lp.get("total", 0) for lp in layer_progress.values())
                            current_bytes = sum(lp.get("current", 0) for lp in layer_progress.values())
                            layer_percent = (current_bytes / total_bytes * 100) if total_bytes > 0 else 0
                            layer_specific_percent = (current / total * 100) if total > 0 else 0
                            overall_percent = ((completed_images + layer_percent / 100) / total_images) * 100

                            progress_queue.put(
                                {
                                    "image": image,
                                    "layer_id": layer_id,
                                    "status": status,
                                    "current": current,
                                    "total": total,
                                    "progress_percent": round(layer_specific_percent, 1),
                                    "image_percent": round(layer_percent, 1),
                                    "overall_percent": round(overall_percent, 1),
                                    "progress_text": event.get("progress", ""),
                                }
                            )

                    except docker.errors.APIError as e:
                        logger.error(f"Error pulling {image}: {e}")
                        progress_queue.put({"error": f"Failed to pull {image}: {str(e)}"})
                        progress_queue.put(None)  # Signal completion
                        return

                    completed_images += 1
                    progress_queue.put(
                        {
                            "status": "Complete",
                            "image": image,
                            "message": f"Pulled {image} successfully",
                            "overall_percent": round((completed_images / total_images) * 100, 1),
                        }
                    )

                client.close()
                progress_queue.put(
                    {
                        "complete": True,
                        "message": "All images pulled successfully",
                        "overall_percent": 100,
                    }
                )
                progress_queue.put(None)  # Signal completion

            except Exception as e:
                logger.error(f"Error in pull thread: {e}", exc_info=True)
                progress_queue.put({"error": str(e)})
                progress_queue.put(None)

        # Start pull in background thread
        pull_thread = threading.Thread(target=pull_in_thread, daemon=True)
        pull_thread.start()

        # Stream progress events from queue to callback
        while True:
            # Check queue in a non-blocking way
            time.sleep(0.01)  # Small delay to avoid busy-waiting

            while not progress_queue.empty():
                try:
                    data = progress_queue.get_nowait()
                    if data is None:  # Completion signal
                        pull_thread.join(timeout=1.0)
                        return {"success": True, "message": "All images pulled successfully"}

                    if "error" in data:
                        pull_thread.join(timeout=1.0)
                        return {"success": False, "error": data["error"]}

                    if progress_callback:
                        progress_callback(data)

                except Exception as e:
                    logger.error(f"Error processing progress event: {e}")
                    continue

    def _pull_images_podman_sdk(self, images: List[str], progress_callback=None):
        """Pull images using podman-py SDK with progress streaming"""
        from podman import PodmanClient

        # Connect to Podman socket
        client = PodmanClient()
        total_images = len(images)
        completed_images = 0

        for image in images:
            logger.info(f"Pulling image (Podman SDK): {image}")
            if progress_callback:
                progress_callback({"status": "Starting", "image": image, "message": f"Pulling {image}..."})

            layer_progress = {}

            try:
                # Use stream=True and decode=True for progress events
                for event in client.images.pull(image, stream=True, decode=True):
                    # Podman returns dict events similar to Docker when decode=True
                    if isinstance(event, dict):
                        layer_id = event.get("id", "")
                        status = event.get("status", event.get("stream", ""))
                        progress_detail = event.get("progressDetail", {})

                        current = progress_detail.get("current", 0)
                        total = progress_detail.get("total", 0)

                        if layer_id and total > 0:
                            layer_progress[layer_id] = {"current": current, "total": total}

                        total_bytes = sum(lp.get("total", 0) for lp in layer_progress.values())
                        current_bytes = sum(lp.get("current", 0) for lp in layer_progress.values())
                        layer_percent = (current_bytes / total_bytes * 100) if total_bytes > 0 else 0
                        layer_specific_percent = (current / total * 100) if total > 0 else 0
                        overall_percent = ((completed_images + layer_percent / 100) / total_images) * 100

                        if progress_callback:
                            progress_callback(
                                {
                                    "image": image,
                                    "layer_id": layer_id,
                                    "status": status.strip() if isinstance(status, str) else status,
                                    "current": current,
                                    "total": total,
                                    "progress_percent": round(layer_specific_percent, 1),
                                    "image_percent": round(layer_percent, 1),
                                    "overall_percent": round(overall_percent, 1),
                                    "progress_text": event.get("progress", ""),
                                }
                            )
                    else:
                        # String event (older format or status message)
                        if progress_callback:
                            progress_callback(
                                {
                                    "image": image,
                                    "status": str(event).strip(),
                                    "overall_percent": ((completed_images) / total_images) * 100,
                                }
                            )

            except Exception as e:
                logger.error(f"Error pulling {image} with Podman: {e}")
                if progress_callback:
                    progress_callback({"error": f"Failed to pull {image}: {str(e)}"})
                return {"success": False, "error": str(e)}

            completed_images += 1
            if progress_callback:
                progress_callback(
                    {
                        "status": "Complete",
                        "image": image,
                        "message": f"Pulled {image} successfully",
                        "overall_percent": round((completed_images / total_images) * 100, 1),
                    }
                )

        client.close()

        if progress_callback:
            progress_callback(
                {
                    "complete": True,
                    "message": "All images pulled successfully",
                    "overall_percent": 100,
                }
            )

        return {"success": True, "message": "All images pulled successfully"}

    def _pull_images_cli(self, images: List[str], progress_callback=None) -> Dict[str, any]:
        """
        Fallback: Pull images using compose CLI (no detailed progress)
        """
        try:
            logger.info(f"Pulling docker images from {self.compose_file} (CLI mode)")

            if self.docker_cmd == "docker":
                cmd = [self.docker_cmd, "compose", "-f", str(self.compose_file), "pull"]
            else:
                cmd = ["podman-compose", "-f", str(self.compose_file), "pull"]

            process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                cwd=self.compose_file.parent,
                text=True,
            )

            # Read output line by line
            for line in iter(process.stdout.readline, ""):
                if not line:
                    break
                log_line = line.rstrip()
                if log_line and progress_callback:
                    progress_callback(
                        {
                            "status": "Pulling",
                            "message": log_line,
                        }
                    )

            process.wait()

            if process.returncode == 0:
                if progress_callback:
                    progress_callback(
                        {
                            "complete": True,
                            "message": "All images pulled successfully",
                            "overall_percent": 100,
                        }
                    )
                return {"success": True, "message": "Docker images pulled successfully"}
            else:
                return {"success": False, "error": "Failed to pull docker images"}

        except Exception as e:
            logger.error(f"Error pulling docker images (CLI): {e}")
            return {"success": False, "error": str(e)}

    def start_services(self) -> Dict[str, any]:
        """
        Start docker-compose services

        Returns:
            Dictionary with status and message
        """
        if not self.docker_cmd:
            return {
                "success": False,
                "error": "Docker/Podman not found. Please install Docker or Podman to continue.",
            }

        if not self.compose_file.exists():
            return {
                "success": False,
                "error": f"docker-compose.yml not found at {self.compose_file}",
            }

        try:
            logger.debug(f"Starting docker-compose services from {self.compose_file}")

            # Use docker compose (v2) or docker-compose (v1)
            if self.docker_cmd == "docker":
                # Try docker compose (v2) first
                cmd = [self.docker_cmd, "compose", "-f", str(self.compose_file), "up", "-d"]
            else:
                # Podman uses podman-compose
                cmd = ["podman-compose", "-f", str(self.compose_file), "up", "-d"]

            # Inject environment variables from app_paths
            from file_brain.core.paths import app_paths

            env = os.environ.copy()
            env.update(app_paths.get_env_vars())
            # Inject dynamic API key
            env["TYPESENSE_API_KEY"] = settings.typesense_api_key

            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                cwd=self.compose_file.parent,
                env=env,
                timeout=60,
            )

            if result.returncode == 0:
                logger.debug("Docker services started successfully")
                return {
                    "success": True,
                    "message": "Docker services started successfully",
                    "stdout": result.stdout,
                    "stderr": result.stderr,
                }
            else:
                error_msg = result.stderr or result.stdout
                logger.error(f"Failed to start docker services: {error_msg}")
                return {
                    "success": False,
                    "error": f"Failed to start docker services: {error_msg}",
                    "stdout": result.stdout,
                    "stderr": result.stderr,
                }

        except Exception as e:
            logger.error(f"Error starting docker services: {e}")
            return {
                "success": False,
                "error": f"Error starting docker services: {str(e)}",
            }

    def stop_services(self) -> Dict[str, any]:
        """
        Stop docker-compose services

        Returns:
            Dictionary with status and message
        """
        if not self.docker_cmd:
            return {"success": False, "error": "Docker/Podman not found"}

        try:
            logger.debug("Stopping docker-compose services")

            if self.docker_cmd == "docker":
                cmd = [self.docker_cmd, "compose", "-f", str(self.compose_file), "down"]
            else:
                cmd = ["podman-compose", "-f", str(self.compose_file), "down"]

            # Inject environment variables from app_paths
            from file_brain.core.paths import app_paths

            env = os.environ.copy()
            env.update(app_paths.get_env_vars())
            # Inject dynamic API key for consistency (though less critical for stop)
            env["TYPESENSE_API_KEY"] = settings.typesense_api_key

            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                cwd=self.compose_file.parent,
                env=env,
                timeout=60,
            )

            if result.returncode == 0:
                logger.debug("Docker services stopped successfully")
                return {
                    "success": True,
                    "message": "Docker services stopped successfully",
                }
            else:
                error_msg = result.stderr or result.stdout
                logger.warning(f"Error stopping docker services: {error_msg}")
                return {
                    "success": False,
                    "error": f"Error stopping docker services: {error_msg}",
                }

        except Exception as e:
            logger.error(f"Error stopping docker services: {e}")
            return {
                "success": False,
                "error": f"Error stopping docker services: {str(e)}",
            }

    def get_services_status(self) -> Dict[str, any]:
        """
        Get status of docker-compose services

        Returns:
            Dictionary with service statuses
        """
        if not self.docker_cmd:
            return {"success": False, "error": "Docker/Podman not found"}

        try:
            if self.docker_cmd == "docker":
                cmd = [self.docker_cmd, "compose", "-f", str(self.compose_file), "ps", "--format", "json"]
            else:
                cmd = ["podman-compose", "-f", str(self.compose_file), "ps"]

            # Inject environment variables from app_paths
            from file_brain.core.paths import app_paths

            env = os.environ.copy()
            env.update(app_paths.get_env_vars())
            env["TYPESENSE_API_KEY"] = settings.typesense_api_key

            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                cwd=self.compose_file.parent,
                env=env,
                timeout=10,
            )

            if result.returncode == 0:
                # Parse output
                import json

                output = result.stdout
                services = []

                # Docker compose v2 returns JSON
                if output.strip():
                    try:
                        # Each line is a JSON object
                        for line in output.strip().split("\n"):
                            if line.strip():
                                service_data = json.loads(line)
                                services.append(
                                    {
                                        "name": service_data.get("Name", ""),
                                        "service": service_data.get("Service", ""),
                                        "state": service_data.get("State", ""),
                                        "status": service_data.get("Status", ""),
                                        "health": service_data.get("Health", ""),
                                    }
                                )
                    except json.JSONDecodeError:
                        # Fallback to text parsing if JSON fails
                        logger.warning("Failed to parse docker ps JSON output")

                # Check if any containers are actually running before performing HTTP health checks
                # This prevents long timeouts on Windows when containers haven't started yet
                any_running = any(s.get("state") == "running" for s in services)

                # Only perform application-level health checks via HTTP if containers are running
                if any_running:
                    import time

                    import httpx

                    def check_service_health(
                        name: str,
                        url: str,
                        headers: dict = None,
                        timeout: float = 5.0,
                        max_retries: int = 3,
                        retry_delay: float = 1.0,
                    ) -> bool:
                        """
                        Check if a service is actually responding to HTTP requests.
                        Uses retry logic to handle slow container startup.

                        Args:
                            name: Service name for logging
                            url: URL to check
                            headers: Optional HTTP headers
                            timeout: Timeout for each attempt in seconds
                            max_retries: Number of retry attempts
                            retry_delay: Delay between retries in seconds
                        """
                        for attempt in range(max_retries):
                            try:
                                with httpx.Client(timeout=timeout) as client:
                                    resp = client.get(url, headers=headers or {})
                                    healthy = resp.status_code < 400
                                    if healthy:
                                        logger.info(
                                            f"Health check {name}: {url} -> status {resp.status_code}, healthy=True"
                                        )
                                        return True
                                    logger.debug(f"Health check {name}: {url} -> status {resp.status_code}, unhealthy")
                            except Exception as e:
                                logger.debug(
                                    f"Health check {name}: {url} -> attempt {attempt + 1}/{max_retries} failed: {e}"
                                )

                            # Wait before retry (except on last attempt)
                            if attempt < max_retries - 1:
                                time.sleep(retry_delay)

                        logger.info(f"Health check {name}: {url} -> failed after {max_retries} attempts")
                        return False

                    # Check Tika
                    tika_healthy = check_service_health("tika", f"{settings.tika_url}/version")

                    # Check Typesense
                    typesense_healthy = check_service_health(
                        "typesense",
                        f"{settings.typesense_url}/debug",
                        headers={"X-TYPESENSE-API-KEY": settings.typesense_api_key},
                    )
                else:
                    # Skip HTTP health checks when containers aren't running
                    # This prevents long timeouts (15+ seconds on Windows) during startup
                    logger.info("No containers running - skipping HTTP health checks")
                    tika_healthy = False
                    typesense_healthy = False

                # Update services with actual health status
                for service in services:
                    service_name = service.get("service", "").lower()
                    if "tika" in service_name:
                        service["health"] = "healthy" if tika_healthy else "unhealthy"
                    elif "typesense" in service_name:
                        service["health"] = "healthy" if typesense_healthy else "unhealthy"

                overall_healthy = all(s.get("health") == "healthy" for s in services) if services else False

                return {
                    "success": True,
                    "services": services,
                    "running": any(s.get("state") == "running" for s in services),
                    "healthy": overall_healthy,
                }
            else:
                return {
                    "success": False,
                    "error": f"Failed to get services status: {result.stderr}",
                    "services": [],
                    "running": False,
                    "healthy": False,
                }

        except Exception as e:
            logger.error(f"Error getting services status: {e}")
            return {
                "success": False,
                "error": str(e),
                "services": [],
                "running": False,
                "healthy": False,
            }

    def get_container_logs(
        self,
        service_name: str,
        tail: int = 100,
        follow: bool = False,
    ) -> subprocess.Popen:
        """
        Get logs from a specific container

        Args:
            service_name: Name of the service (e.g., 'typesense', 'tika')
            tail: Number of lines to show from the end
            follow: Whether to follow the logs (stream)

        Returns:
            Subprocess for streaming logs
        """
        if not self.docker_cmd:
            raise RuntimeError("Docker/Podman not found")

        cmd = [
            self.docker_cmd,
            "compose",
            "-f",
            str(self.compose_file),
            "logs",
            "--tail",
            str(tail),
        ]

        if follow:
            cmd.append("--follow")

        cmd.append(service_name)

        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            cwd=self.compose_file.parent,
            text=True,
        )

        return process

    def stream_all_logs(self, callback):
        """
        Stream logs from all containers

        Args:
            callback: Function to call with log lines
        """
        if not self.docker_cmd:
            raise RuntimeError("Docker/Podman not found")

        cmd = [
            self.docker_cmd,
            "compose",
            "-f",
            str(self.compose_file),
            "logs",
            "--follow",
            "--tail",
            "50",
        ]

        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            cwd=self.compose_file.parent,
            text=True,
        )

        try:
            for line in iter(process.stdout.readline, ""):
                if not line:
                    break
                log_line = line.rstrip()
                callback(log_line)

        except Exception as e:
            logger.error(f"Error streaming logs: {e}")
        finally:
            if process.poll() is None:
                process.terminate()
                process.wait()


# Global docker manager instance
_docker_manager: Optional[DockerManager] = None


def get_docker_manager() -> DockerManager:
    """Get the global docker manager instance"""
    global _docker_manager
    if _docker_manager is None:
        _docker_manager = DockerManager()
    return _docker_manager
