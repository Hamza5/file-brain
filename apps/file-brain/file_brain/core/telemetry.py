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
        is_frozen = getattr(sys, "frozen", False)
        if settings.debug:
            self.environment = "development"
        elif is_frozen:
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

        Priority order:
        1. py-machineid (hashed) - most reliable cross-platform
        2. Platform-specific identifiers (hostname + username hash)
        3. Random persistent ID (stored in user config)

        Returns:
            A deterministic device identifier string
        """
        import hashlib
        import platform
        import socket
        from pathlib import Path

        import platformdirs

        # Method 1: Try py-machineid (most reliable)
        if machineid is not None:
            try:
                device_id = machineid.hashed_id()
                logger.debug("Generated device ID using py-machineid")
                return device_id
            except Exception as e:
                logger.warning(f"py-machineid failed: {type(e).__name__}: {e}")
        else:
            logger.debug("py-machineid not available, using fallback")

        # Method 2: Platform-specific fallback (hostname + username)
        try:
            hostname = socket.gethostname()
            username = platform.node() or "unknown"
            system_info = f"{hostname}:{username}:{platform.system()}"

            # Hash for privacy
            device_id = hashlib.sha256(system_info.encode()).hexdigest()
            logger.info(f"Generated device ID using hostname+username (hostname: {hostname})")
            return device_id
        except Exception as e:
            logger.warning(f"Hostname-based ID generation failed: {type(e).__name__}: {e}")

        # Method 3: Persistent random ID (last resort)
        try:
            config_dir = Path(platformdirs.user_config_dir(settings.app_name, ensure_exists=True))
            device_id_file = config_dir / ".device_id"

            if device_id_file.exists():
                device_id = device_id_file.read_text().strip()
                logger.info("Loaded persistent device ID from config")
                return device_id
            else:
                # Generate and persist a new random ID
                import secrets

                device_id = hashlib.sha256(secrets.token_bytes(32)).hexdigest()
                device_id_file.write_text(device_id)
                logger.info("Generated and persisted new random device ID")
                return device_id
        except Exception as e:
            logger.error(f"All device ID generation methods failed: {type(e).__name__}: {e}")
            return "unknown-device"

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
                "environment": self.environment,
                "app_version": settings.app_version,
                "app_name": settings.app_name,
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
            logger.info(f"Flushing batched events: {events_copy}")
            self.capture_event("batched_events", {"events": events_copy})

            # Clear counters and update last flush time
            self.event_counters.clear()
            self.last_flush = time.time()
            logger.debug(f"Batch flush complete, sent {len(events_copy)} event types")
        except Exception as e:
            logger.error(f"Failed to flush batched events: {e}")

    def capture_exception(self, exception: Exception):
        """Capture an exception."""
        if not self.enabled or not self.posthog:
            return

        try:
            self.posthog.capture(
                distinct_id=self.distinct_id,
                event="exception",
                properties={
                    "exception_type": type(exception).__name__,
                    "exception_message": str(exception),
                    "environment": self.environment,
                    "app_version": settings.app_version,
                },
            )
        except Exception as e:
            logger.debug(f"Failed to capture exception: {e}")

    def shutdown(self):
        """Cleanly shutdown the PostHog client."""
        try:
            # Flush any remaining batched events before shutdown
            if self.event_counters:
                logger.info(f"Flushing {len(self.event_counters)} batched event types before shutdown...")
                self.flush_batched_events()
            else:
                logger.info("No batched events to flush on shutdown")

            # Capture shutdown event
            logger.info("Capturing application_shutdown event...")
            self.capture_event("application_shutdown")

            if self.posthog:
                logger.info("Shutting down PostHog client (this may take a few seconds)...")
                # PostHog.shutdown() blocks until all queued events are sent
                # This is expected and ensures data isn't lost
                self.posthog.shutdown()
                logger.info("PostHog client shutdown complete")
        except Exception as e:
            logger.error(f"Error shutting down telemetry: {e}", exc_info=True)


# Global instance
telemetry = TelemetryManager()
