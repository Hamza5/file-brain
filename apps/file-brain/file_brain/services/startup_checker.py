"""
Startup Check Service - Validates all system requirements on app startup

This service performs comprehensive checks to determine if the app is ready to run
or if the initialization wizard needs to be shown. It replaces the simple DB flag
approach with actual validation of external conditions.
"""

import asyncio
from dataclasses import dataclass
from typing import Optional

from file_brain.core.logging import logger
from file_brain.core.typesense_schema import get_schema_version
from file_brain.services.docker_manager import get_docker_manager
from file_brain.services.model_downloader import get_model_downloader
from file_brain.services.typesense_client import get_typesense_client


@dataclass
class CheckDetail:
    """Result of an individual check"""

    passed: bool
    message: str


@dataclass
class StartupCheckResult:
    """Complete startup check results"""

    docker_available: CheckDetail
    docker_images: CheckDetail
    services_healthy: CheckDetail
    model_downloaded: CheckDetail
    collection_ready: CheckDetail
    schema_current: CheckDetail

    @property
    def all_checks_passed(self) -> bool:
        """Check if all validations passed"""
        return all(
            [
                self.docker_available.passed,
                self.docker_images.passed,
                self.services_healthy.passed,
                self.model_downloaded.passed,
                self.collection_ready.passed,
                self.schema_current.passed,
            ]
        )

    @property
    def needs_wizard(self) -> bool:
        """
        Check if wizard needs to be shown.

        The wizard is only needed for critical failures that require user intervention:
        - Docker not available (need to install)
        - Images missing (need to download)
        - Model missing (need to download)
        - Collection missing BUT ONLY if services are healthy (otherwise app will start services first)

        Services not running is NOT a wizard-worthy issue - the app can start them automatically.
        """
        # Critical checks that always require wizard
        always_critical = [
            self.docker_available.passed,
            self.docker_images.passed,
            self.model_downloaded.passed,
        ]

        if not all(always_critical):
            return True

        # Collection check only matters if services are healthy
        # If services aren't healthy, the app will start them first, then check collection
        if self.services_healthy.passed and not self.collection_ready.passed:
            return True

        return False

    @property
    def is_upgrade(self) -> bool:
        """
        Check if this is an upgrade scenario (some checks passed, some failed).
        If Docker is available and at least one other check passed, it's likely an upgrade.
        """
        if not self.docker_available.passed:
            return False

        checks = [
            self.docker_images.passed,
            self.model_downloaded.passed,
            self.collection_ready.passed,
        ]

        # If at least one check passed, it's an upgrade scenario
        return any(checks) and not all(checks + [self.schema_current.passed])

    def get_first_failed_step(self) -> Optional[int]:
        """
        Get the wizard step number to start from based on first failed check.

        Returns:
            Step number (0-5) or None if all checks passed

        Wizard steps:
        0: Docker Check
        1: Image Pull
        2: Service Start (only if services are unhealthy, not just stopped)
        3: Model Download
        4: Collection Create
        5: Complete
        """
        if not self.docker_available.passed:
            return 0
        if not self.docker_images.passed:
            return 1
        # Skip service start step - services not running doesn't require wizard
        # The app will start them automatically via ContainerInitOverlay
        if not self.model_downloaded.passed:
            return 3
        if not self.collection_ready.passed or not self.schema_current.passed:
            return 4
        return None


class StartupChecker:
    """Service to perform all startup checks"""

    def __init__(self):
        self.docker_manager = get_docker_manager()
        self.model_downloader = get_model_downloader()
        self.typesense_client = get_typesense_client()

    async def check_docker_available(self) -> CheckDetail:
        """Check if Docker/Podman is installed and accessible"""
        try:
            info = self.docker_manager.get_docker_info()
            if info.get("available"):
                version = info.get("version", "unknown")
                command = info.get("command", "docker")
                return CheckDetail(passed=True, message=f"{command} {version}")
            else:
                error = info.get("error", "Not found")
                return CheckDetail(passed=False, message=f"Docker/Podman not available: {error}")
        except Exception as e:
            logger.error(f"Error checking Docker availability: {e}")
            return CheckDetail(passed=False, message=f"Error: {str(e)}")

    async def check_docker_images(self) -> CheckDetail:
        """Check if required Docker images are present locally"""
        try:
            result = await self.docker_manager.check_required_images()
            if result.get("success") and result.get("all_present"):
                return CheckDetail(passed=True, message="All required images present")
            else:
                missing = result.get("missing", [])
                count = len(missing)
                return CheckDetail(passed=False, message=f"{count} image(s) missing")
        except Exception as e:
            logger.error(f"Error checking Docker images: {e}")
            return CheckDetail(passed=False, message=f"Error: {str(e)}")

    async def check_services_healthy(self) -> CheckDetail:
        """Check if Docker services are running and healthy"""
        try:
            result = await self.docker_manager.get_services_status()
            if result.get("healthy"):
                return CheckDetail(passed=True, message="All services healthy")
            elif result.get("running"):
                return CheckDetail(passed=False, message="Services running but not healthy")
            else:
                return CheckDetail(passed=False, message="Services not running")
        except Exception as e:
            logger.error(f"Error checking service health: {e}")
            return CheckDetail(passed=False, message=f"Error: {str(e)}")

    async def check_model_downloaded(self) -> CheckDetail:
        """Check if embedding model is downloaded"""
        try:
            status = self.model_downloader.check_model_exists()
            if status.get("exists"):
                return CheckDetail(passed=True, message="Embedding model ready")
            else:
                missing_count = len(status.get("missing_files", []))
                return CheckDetail(passed=False, message=f"{missing_count} model file(s) missing")
        except Exception as e:
            logger.error(f"Error checking model status: {e}")
            return CheckDetail(passed=False, message=f"Error: {str(e)}")

    async def check_collection_ready(self) -> CheckDetail:
        """Check if Typesense collection exists"""
        try:
            exists = await self.typesense_client.check_collection_exists()
            if exists:
                return CheckDetail(passed=True, message="Collection exists")
            else:
                return CheckDetail(passed=False, message="Collection not found")
        except Exception as e:
            logger.error(f"Error checking collection: {e}")
            return CheckDetail(passed=False, message=f"Error: {str(e)}")

    async def check_schema_current(self) -> CheckDetail:
        """
        Check if collection schema matches current version.

        For now, this is simplified: if the collection exists, we assume the schema
        is current. In the future, we could store the schema version hash in Typesense
        metadata and compare it with the current version to detect schema changes.

        To force a schema update, manually drop the collection via the wizard's
        "Reset Database" button.
        """
        try:
            # Get current schema version from code
            current_version = get_schema_version()

            # Check if collection exists
            exists = await self.typesense_client.check_collection_exists()

            if not exists:
                return CheckDetail(passed=False, message="Collection does not exist")

            # For now, assume schema is current if collection exists
            return CheckDetail(passed=True, message=f"Schema version: {current_version}")

        except Exception as e:
            logger.error(f"Error checking schema version: {e}")
            return CheckDetail(passed=False, message=f"Error: {str(e)}")

    async def perform_all_checks(self) -> StartupCheckResult:
        """
        Perform all startup checks concurrently.

        Returns:
            Complete startup check results
        """
        logger.info("Starting comprehensive startup checks...")

        # Run all checks concurrently for speed
        results = await asyncio.gather(
            self.check_docker_available(),
            self.check_docker_images(),
            self.check_services_healthy(),
            self.check_model_downloaded(),
            self.check_collection_ready(),
            self.check_schema_current(),
            return_exceptions=True,
        )

        # Handle any exceptions from gather
        def safe_result(idx: int, default_msg: str) -> CheckDetail:
            result = results[idx]
            if isinstance(result, Exception):
                logger.error(f"Check {idx} raised exception: {result}")
                return CheckDetail(passed=False, message=f"Error: {str(result)}")
            return result

        check_result = StartupCheckResult(
            docker_available=safe_result(0, "Docker check failed"),
            docker_images=safe_result(1, "Image check failed"),
            services_healthy=safe_result(2, "Service check failed"),
            model_downloaded=safe_result(3, "Model check failed"),
            collection_ready=safe_result(4, "Collection check failed"),
            schema_current=safe_result(5, "Schema check failed"),
        )

        logger.info(f"Startup checks complete. All passed: {check_result.all_checks_passed}")
        if check_result.needs_wizard:
            logger.info(f"Wizard needed starting from step {check_result.get_first_failed_step()}")

        return check_result


# Global instance
_checker: Optional[StartupChecker] = None


def get_startup_checker() -> StartupChecker:
    """Get or create global startup checker instance"""
    global _checker
    if _checker is None:
        _checker = StartupChecker()
    return _checker
