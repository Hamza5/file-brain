"""
Startup Check Service - Validates all system requirements on app startup

This service performs comprehensive checks to determine if the app is ready to run
or if the initialization wizard needs to be shown. It replaces the simple DB flag
approach with actual validation of external conditions.
"""

from dataclasses import dataclass
from typing import Optional

from file_brain.core.logging import logger
from file_brain.core.typesense_schema import get_schema_version
from file_brain.database.models import db_session
from file_brain.database.repositories.wizard_state_repository import (
    WizardStateRepository,
)
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
    wizard_reset: CheckDetail

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
                self.wizard_reset.passed,
            ]
        )

    @property
    def is_first_run(self) -> bool:
        """
        Check if this is the first run (wizard was never completed).

        Returns True when:
        - Wizard was never completed (wizard_reset.passed is False)

        This is distinct from user-requested reset, which we detect by checking
        if the wizard was previously completed but is now reset.
        """
        return not self.wizard_reset.passed

    @property
    def needs_wizard(self) -> bool:
        """
        Check if wizard needs to be shown.

        The wizard is needed ONLY for:
        1. First run (wizard was never completed)
        2. User explicitly reset the wizard via "Reset Wizard" button

        On normal runs, even if checks fail (Docker issues, services down, etc.),
        we show the main app with retry UI instead of forcing the wizard.
        This gives users control to fix issues without going through the full wizard.
        """
        # Show wizard if it was never completed (first run)
        if self.is_first_run:
            return True

        # If wizard was completed before, never auto-show it again
        # Even if checks fail, let the app handle it with retry UI
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
        # If wizard was deliberately reset, start from the beginning
        if not self.wizard_reset.passed:
            return 0

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

    def check_docker_available(self) -> CheckDetail:
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

    def check_docker_images(self) -> CheckDetail:
        """Check if required Docker images are present locally"""
        try:
            result = self.docker_manager.check_required_images()
            if result.get("success") and result.get("all_present"):
                return CheckDetail(passed=True, message="All required images present")
            else:
                missing = result.get("missing", [])
                count = len(missing)
                return CheckDetail(passed=False, message=f"{count} image(s) missing")
        except Exception as e:
            logger.error(f"Error checking Docker images: {e}")
            return CheckDetail(passed=False, message=f"Error: {str(e)}")

    def check_services_healthy(self) -> CheckDetail:
        """Check if Docker services are running and healthy"""
        try:
            result = self.docker_manager.get_services_status()
            if result.get("healthy"):
                return CheckDetail(passed=True, message="All services healthy")
            elif result.get("running"):
                return CheckDetail(passed=False, message="Services running but not healthy")
            else:
                return CheckDetail(passed=False, message="Services not running")
        except Exception as e:
            logger.error(f"Error checking service health: {e}")
            return CheckDetail(passed=False, message=f"Error: {str(e)}")

    def check_model_downloaded(self) -> CheckDetail:
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

    def check_collection_ready(self) -> CheckDetail:
        """
        Check if Typesense collection exists.

        Handles transient errors (503, connection errors) gracefully to avoid
        incorrectly triggering the wizard during normal startup when Typesense
        is still initializing.
        """
        try:
            exists = self.typesense_client.check_collection_exists()
            if exists:
                return CheckDetail(passed=True, message="Collection exists")
            else:
                # Collection truly doesn't exist (404)
                return CheckDetail(passed=False, message="Collection not found")
        except Exception as e:
            # Transient errors (503, connection errors) during initialization
            # Don't fail the check - let ContainerInitOverlay handle the wait
            error_msg = str(e).lower()
            if "503" in error_msg or "not ready" in error_msg or "lagging" in error_msg or "connection" in error_msg:
                logger.info(f"Typesense initializing: {e}")
                return CheckDetail(passed=True, message="Typesense initializing")
            else:
                # Unexpected error - log and fail the check
                logger.error(f"Error checking collection: {e}")
                return CheckDetail(passed=False, message=f"Error: {str(e)}")

    def check_schema_current(self) -> CheckDetail:
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
            exists = self.typesense_client.check_collection_exists()

            if not exists:
                return CheckDetail(passed=False, message="Collection does not exist")

            # For now, assume schema is current if collection exists
            return CheckDetail(passed=True, message=f"Schema version: {current_version}")

        except Exception as e:
            logger.error(f"Error checking schema version: {e}")
            return CheckDetail(passed=False, message=f"Error: {str(e)}")

    def check_wizard_reset(self) -> CheckDetail:
        """
        Check if wizard was completed or deliberately reset.

        This checks the database wizard_completed flag. If it's False,
        it means either the wizard was never completed or the user
        deliberately reset it via the "Resetup Wizard" button.

        Returns:
            CheckDetail with passed=True if wizard is completed, False otherwise
        """
        try:
            with db_session() as db:
                repo = WizardStateRepository(db)
                state = repo.get()

                if state and state.wizard_completed:
                    return CheckDetail(passed=True, message="Wizard completed")
                else:
                    return CheckDetail(passed=False, message="Wizard not completed or was reset")

        except Exception as e:
            logger.error(f"Error checking wizard reset status: {e}")
            # If we can't check, assume wizard is completed to avoid unnecessary wizard display
            return CheckDetail(passed=True, message=f"Could not check wizard status: {str(e)}")

    def perform_all_checks(self) -> StartupCheckResult:
        """
        Perform all startup checks with smart short-circuiting.

        OPTIMIZATION STRATEGY:
        1. Run fast local checks first (wizard reset, model downloaded)
        2. If wizard is already needed, skip slow network checks
        3. Otherwise run Docker checks, then network checks

        This avoids timeout delays when wizard is definitely needed.

        Returns:
            Complete startup check results
        """
        logger.info("Starting comprehensive startup checks...")

        # PHASE 1: Fast local checks (no network required)
        # Check these first because they're instant and might trigger early exit
        wizard_check = self.check_wizard_reset()
        model_check = self.check_model_downloaded()

        # EARLY EXIT: If wizard was reset, skip all other checks
        if not wizard_check.passed:
            logger.info("Wizard was reset - skipping remaining checks for fast startup")
            return StartupCheckResult(
                docker_available=CheckDetail(passed=True, message="Skipped - wizard reset"),
                docker_images=CheckDetail(passed=True, message="Skipped - wizard reset"),
                services_healthy=CheckDetail(passed=True, message="Skipped - wizard reset"),
                model_downloaded=model_check,
                collection_ready=CheckDetail(passed=True, message="Skipped - wizard reset"),
                schema_current=CheckDetail(passed=True, message="Skipped - wizard reset"),
                wizard_reset=wizard_check,
            )

        # EARLY EXIT: If model is missing, wizard is needed - skip network checks
        if not model_check.passed:
            logger.info("Model missing - skipping network checks for fast startup")
            # Still check Docker availability as it's fast and useful for wizard UI
            docker_check = self.check_docker_available()
            # Check Docker images too since we're here and it's fast
            if docker_check.passed:
                images_check = self.check_docker_images()
            else:
                images_check = CheckDetail(passed=True, message="Skipped - Docker not available")
            return StartupCheckResult(
                docker_available=docker_check,
                docker_images=images_check,
                services_healthy=CheckDetail(passed=True, message="Skipped - model missing"),
                model_downloaded=model_check,
                collection_ready=CheckDetail(passed=True, message="Skipped - model missing"),
                schema_current=CheckDetail(passed=True, message="Skipped - model missing"),
                wizard_reset=wizard_check,
            )

        # PHASE 2: Check Docker availability
        docker_check = self.check_docker_available()

        if not docker_check.passed:
            logger.info("Docker not available - skipping container-dependent checks for fast startup")
            # Return immediately without making network calls to unavailable services
            check_result = StartupCheckResult(
                docker_available=docker_check,
                docker_images=CheckDetail(passed=True, message="Skipped - Docker not available"),
                services_healthy=CheckDetail(passed=True, message="Skipped - Docker not available"),
                model_downloaded=model_check,
                collection_ready=CheckDetail(passed=True, message="Skipped - Docker not available"),
                schema_current=CheckDetail(passed=True, message="Skipped - Docker not available"),
                wizard_reset=wizard_check,
            )

            logger.info(f"Fast-path checks complete. Wizard needed: {check_result.needs_wizard}")
            if check_result.needs_wizard:
                logger.info(f"Wizard needed starting from step {check_result.get_first_failed_step()}")

            return check_result

        # PHASE 3: Check Docker images (fast, no network)
        images_check = self.check_docker_images()

        # EARLY EXIT: If images are missing, wizard is needed - skip network checks
        if not images_check.passed:
            logger.info("Docker images missing - skipping network checks for fast startup")
            return StartupCheckResult(
                docker_available=docker_check,
                docker_images=images_check,
                services_healthy=CheckDetail(passed=True, message="Skipped - images missing"),
                model_downloaded=model_check,
                collection_ready=CheckDetail(passed=True, message="Skipped - images missing"),
                schema_current=CheckDetail(passed=True, message="Skipped - images missing"),
                wizard_reset=wizard_check,
            )

        # PHASE 4: Run network-dependent checks (only if wizard might not be needed)
        # All critical checks passed so far - now check if services are up
        logger.info("Critical checks passed - running network health checks")

        # Check service health first - if unhealthy, skip Typesense checks to avoid timeouts
        services_check = self.check_services_healthy()

        if services_check.passed:
            # Services are healthy - safe to check Typesense
            logger.info("Services healthy - checking Typesense collection and schema")
            # Run checks sequentially
            try:
                collection_check = self.check_collection_ready()
                schema_check = self.check_schema_current()
            except Exception as e:
                logger.error(f"Typesense check raised exception: {e}")
                collection_check = CheckDetail(passed=False, message=f"Error: {str(e)}")
                schema_check = CheckDetail(passed=False, message=f"Error: {str(e)}")
        else:
            # Services not healthy - skip Typesense checks to avoid connection timeouts
            logger.info("Services not healthy - skipping Typesense checks to avoid timeouts")
            collection_check = CheckDetail(passed=True, message="Skipped - services not healthy")
            schema_check = CheckDetail(passed=True, message="Skipped - services not healthy")

        check_result = StartupCheckResult(
            docker_available=docker_check,
            docker_images=images_check,
            services_healthy=services_check,
            model_downloaded=model_check,
            collection_ready=collection_check,
            schema_current=schema_check,
            wizard_reset=wizard_check,
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
