"""
Telemetry manager for PostHog integration.
Handles initialization, event capturing, and exception tracking.
"""

import sys
import time
from typing import Dict, Optional

# Optional import - gracefully handle if not available
try:
    import machineid
except ImportError:
    machineid = None

from posthog import Posthog

from file_brain.core.config import settings
from file_brain.core.logging import logger


class TelemetryManager:
    """Singleton manager for telemetry via PostHog."""

    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(TelemetryManager, cls).__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if self._initialized:
            return

        self.posthog: Optional[Posthog] = None
        self.enabled = settings.posthog_enabled
        self.distinct_id = None
        self.environment = "unknown"

        # Event batching
        self.event_counters: Dict[str, int] = {}
        self.last_flush = time.time()
        self.flush_interval = settings.posthog_batch_flush_interval
        self.last_heartbeat = time.time()

        # Always determine environment and generate device ID
        self._determine_environment()
        self.distinct_id = self._generate_device_id()
        logger.info(f"Telemetry initialized (Env: {self.environment}, ID: {self.distinct_id[:16]}...)")

        # Initialize PostHog if enabled
        if self.enabled:
            try:
                self._initialize_posthog()
            except Exception as e:
                logger.error(f"Failed to initialize PostHog: {e}")
                self.enabled = False

        self._initialized = True

    def _determine_environment(self):
        """Determine the application environment."""
        import os

        is_frozen = getattr(sys, "frozen", False)

        # Check if running from a pip-installed package
        # (module installed in site-packages or dist-packages)
        is_pip_installed = False
        try:
            import file_brain

            module_path = os.path.dirname(os.path.abspath(file_brain.__file__))
            is_pip_installed = "site-packages" in module_path or "dist-packages" in module_path
        except Exception:
            pass

        if settings.debug:
            self.environment = "development"
        elif is_frozen or is_pip_installed:
            self.environment = "packaged"
        else:
            self.environment = "production"

    def _initialize_posthog(self):
        """Initialize PostHog client."""
        self.posthog = Posthog(
            project_api_key=settings.posthog_project_api_key,
            host=settings.posthog_host,
        )

    def _generate_device_id(self) -> str:
        """
        Generate a privacy-friendly, deterministic device ID with multiple fallbacks.
        Persists the ID to ensure consistency across different environments/processes.

        Priority order:
        1. Existing persistent ID from file
        2. py-machineid (hashed) - most reliable cross-platform
        3. Platform-specific identifiers (hostname + username hash)
        4. Random persistent ID (last resort)

        Returns:
            A deterministic device identifier string
        """
        import getpass
        import hashlib
        import platform
        import socket
        from pathlib import Path

        import platformdirs

        try:
            config_dir = Path(platformdirs.user_config_dir(settings.app_name, ensure_exists=True))
            device_id_file = config_dir / ".device_id"

            # 1. Try to load existing ID first (Highest Priority)
            if device_id_file.exists():
                try:
                    device_id = device_id_file.read_text().strip()
                    if device_id:
                        logger.info("Loaded persistent device ID from config")
                        return device_id
                except Exception as e:
                    logger.warning(f"Failed to read persistent ID file: {e}")

            # If no existing ID, generate one
            device_id = None

            # 2. Try py-machineid (Primary Generation Method)
            if machineid is not None:
                try:
                    device_id = f"mid_{machineid.hashed_id()}"
                    logger.debug("Generated device ID using py-machineid")
                except Exception as e:
                    logger.warning(f"py-machineid failed: {type(e).__name__}: {e}")
            else:
                logger.debug("py-machineid not available, skipping")

            # 3. Platform-specific fallback (Secondary Generation Method)
            if not device_id:
                try:
                    hostname = socket.gethostname()
                    # Try to get username, fallback to "unknown"
                    try:
                        username = getpass.getuser()
                    except Exception:
                        username = platform.node() or "unknown"

                    system_info = f"{hostname}:{username}:{platform.system()}"

                    # Hash for privacy
                    device_id = f"sys_{hashlib.sha256(system_info.encode()).hexdigest()}"
                    logger.info(f"Generated device ID using hostname+username (hostname: {hostname})")
                except Exception as e:
                    logger.warning(f"Hostname-based ID generation failed: {type(e).__name__}: {e}")

            # 4. Random ID (Last Resort)
            if not device_id:
                import secrets

                try:
                    device_id = f"rnd_{hashlib.sha256(secrets.token_bytes(32)).hexdigest()}"
                    logger.info("Generated new random device ID")
                except Exception as e:
                    logger.error(f"Random ID generation failed: {e}")
                    return "err_unknown_device"

            # Persist the generated ID
            try:
                device_id_file.write_text(device_id)
                logger.info("Persisted device ID to config")
            except Exception as e:
                logger.warning(f"Failed to persist device ID: {e}")

            return device_id

        except Exception as e:
            logger.error(f"Critical error in device ID generation: {e}")
            return "err_critical_failure"

    def capture_event(self, event: str, properties: Optional[Dict] = None):
        """
        Capture a user event.

        Args:
            event: Name of the event
            properties: Additional event properties
        """
        if not self.enabled or not self.posthog:
            return

        try:
            props = {
                "$app_name": settings.app_name,  # Standard PostHog property
                "$app_version": settings.app_version,  # Standard PostHog property
                "install_type": self.environment,  # Custom: dev/packaged/production
                **(properties or {}),
            }

            self.posthog.capture(distinct_id=self.distinct_id, event=event, properties=props)
        except Exception as e:
            logger.debug(f"Failed to capture event '{event}': {e}")

    def track_batched_event(self, event: str, increment: int = 1):
        """
        Track an event to be batched and sent later.

        Args:
            event: Name of the event
            increment: Number to increment the counter by (default: 1)
        """
        if not self.enabled:
            logger.debug(f"Telemetry disabled, skipping batched event: {event}")
            return

        try:
            self.event_counters[event] = self.event_counters.get(event, 0) + increment
            logger.debug(f"Tracked batched event: {event} (count: {self.event_counters[event]})")

            # Check if it's time for periodic flush
            current_time = time.time()
            if current_time - self.last_flush >= self.flush_interval:
                self.flush_batched_events()
        except Exception as e:
            logger.debug(f"Failed to track batched event '{event}': {e}")

    def flush_batched_events(self):
        """Send all batched events to PostHog as a single aggregate event."""
        if not self.enabled or not self.posthog or not self.event_counters:
            if not self.enabled:
                logger.debug("Telemetry disabled, skipping batch flush")
            elif not self.posthog:
                logger.debug("PostHog not initialized, skipping batch flush")
            elif not self.event_counters:
                logger.debug("No batched events to flush")
            return

        try:
            # Send a single aggregate event with all counters
            events_copy = self.event_counters.copy()
            logger.debug(f"Flushing batched events: {events_copy}")
            self.capture_event("batched_events", {"events": events_copy})

            # Clear counters and update last flush time
            self.event_counters.clear()
            self.last_flush = time.time()
            logger.debug(f"Batch flush complete, sent {len(events_copy)} event types")
        except Exception as e:
            logger.error(f"Failed to flush batched events: {e}")

    def _detect_gpu_info(self) -> Dict[str, bool]:
        """
        Detect GPU availability for telemetry.

        Returns:
            Dictionary with GPU detection properties
        """
        try:
            from file_brain.utils.gpu_detector import (
                is_nvidia_docker_runtime_available,
                is_nvidia_gpu_available,
                should_use_gpu_mode,
            )

            return {
                "has_gpu_hardware": is_nvidia_gpu_available(),
                "has_nvidia_runtime": is_nvidia_docker_runtime_available(),
                "gpu_mode_enabled": should_use_gpu_mode(),
            }
        except Exception as e:
            logger.debug(f"Failed to detect GPU info: {e}")
            return {
                "has_gpu_hardware": False,
                "has_nvidia_runtime": False,
                "gpu_mode_enabled": False,
            }

    def set_user_properties(self, properties: Dict):
        """
        Set persistent user properties for analytics segmentation.

        Uses PostHog standard properties (prefixed with $) for system info.
        See: https://posthog.com/docs/product-analytics/person-properties
        """
        if not self.enabled or not self.posthog:
            return

        import platform

        try:
            # Detect GPU info
            gpu_info = self._detect_gpu_info()

            # Use PostHog standard properties for system info + custom app properties
            self.posthog.identify(
                distinct_id=self.distinct_id,
                properties={
                    "$os": platform.system(),  # PostHog standard property
                    "$os_version": platform.release(),  # PostHog standard property
                    "$app_name": settings.app_name,  # Standard PostHog property
                    "$app_version": settings.app_version,  # Standard PostHog property
                    "install_type": self.environment,  # Custom property for dev/packaged/production
                    **gpu_info,  # GPU detection properties
                    **properties,
                },
            )
        except Exception as e:
            logger.debug(f"Failed to set user properties: {e}")

    def capture_exception(self, exception: Exception, context: Optional[Dict] = None):
        """
        Capture an exception with PostHog's exception format.

        PostHog recognizes exceptions when using the $exception event with
        proper $exception_* properties for error tracking UI.
        """
        if not self.enabled or not self.posthog:
            return

        try:
            # PostHog's exception format uses $exception_* properties
            props = {
                "$exception_type": type(exception).__name__,
                "$exception_message": str(exception)[:500],  # Truncate long messages
                "$exception_list": [
                    {
                        "type": type(exception).__name__,
                        "value": str(exception),
                        "stacktrace": {"frames": self._parse_stack_frames(exception)},
                    }
                ],
                # Use PostHog standard properties where applicable
                "$lib": "file-brain-backend",  # PostHog standard property
                "$lib_version": settings.app_version,  # PostHog standard property
                "install_type": self.environment,  # Custom: development/packaged/production
                **(context or {}),
            }

            # Use $exception event type for PostHog error tracking
            self.posthog.capture(
                distinct_id=self.distinct_id,
                event="$exception",  # PostHog's special exception event type
                properties=props,
            )
        except Exception as e:
            logger.debug(f"Failed to capture exception: {e}")

    def _parse_stack_frames(self, exception: Exception) -> list:
        """Parse exception stack frames for PostHog format."""
        frames = []
        tb = exception.__traceback__

        while tb is not None:
            frame = tb.tb_frame
            frames.append(
                {
                    "filename": frame.f_code.co_filename,
                    "function": frame.f_code.co_name,
                    "lineno": tb.tb_lineno,
                }
            )
            tb = tb.tb_next

        return frames

    def shutdown(self):
        """Cleanly shutdown the PostHog client."""
        try:
            # Flush any remaining batched events before shutdown
            if self.event_counters:
                logger.debug(f"Flushing {len(self.event_counters)} batched event types before shutdown...")
                self.flush_batched_events()
            else:
                logger.debug("No batched events to flush on shutdown")

            # Capture shutdown event
            logger.debug("Capturing application_shutdown event...")
            self.capture_event("application_shutdown")

            if self.posthog:
                logger.debug("Shutting down PostHog client (this may take a few seconds)...")
                # PostHog.shutdown() blocks until all queued events are sent
                # This is expected and ensures data isn't lost
                self.posthog.shutdown()
                logger.debug("PostHog client shutdown complete")
        except Exception as e:
            logger.error(f"Error shutting down telemetry: {e}", exc_info=True)

    def check_heartbeat(self):
        """
        Check if it's time to send a heartbeat event and do so if needed.

        Should be called periodically from a background loop.
        """
        if not self.enabled:
            return

        try:
            current_time = time.time()
            if current_time - self.last_heartbeat >= self.flush_interval:
                # Import here to avoid circular dependencies
                from file_brain.services.crawler.manager import get_crawl_job_manager

                try:
                    # Get crawler status
                    crawl_manager = get_crawl_job_manager()
                    status = crawl_manager.get_status()

                    stats = {
                        "auto_indexing_enabled": status.get("monitoring_active", False),
                        "crawl_active": status.get("running", False),
                        "files_indexed": status.get("files_indexed", 0),
                        "files_discovered": status.get("files_discovered", 0),
                        "queue_size": status.get("queue_size", 0),
                        "orphan_count": status.get("orphan_count", 0),
                        "files_skipped": status.get("files_skipped", 0),
                    }

                    logger.debug(f"Sending telemetry heartbeat: {stats}")
                    self.capture_event("heartbeat", stats)
                    self.last_heartbeat = current_time

                except Exception as e:
                    logger.debug(f"Failed to gather heartbeat stats: {e}")

        except Exception as e:
            logger.error(f"Error in telemetry heartbeat check: {e}")


# Global instance
telemetry = TelemetryManager()
