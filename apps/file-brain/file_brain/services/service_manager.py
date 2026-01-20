"""
Service State Manager for tracking initialization and health of all services
Enables instant FastAPI startup with parallel background initialization
"""

import threading
import time
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional

from file_brain.core.config import settings
from file_brain.core.logging import logger


class ServiceState(Enum):
    """Service initialization states"""

    NOT_STARTED = "not_started"
    INITIALIZING = "initializing"
    READY = "ready"
    BUSY = "busy"  # Service is operational but temporarily unresponsive (e.g., processing)
    FAILED = "failed"
    DISABLED = "disabled"


@dataclass
class ServicePhase:
    """Detailed service initialization phase"""

    phase_name: str
    progress_percent: float = 0.0
    message: str = ""
    started_at: float = field(default_factory=time.time)


@dataclass
class ServiceStatus:
    """Individual service status information"""

    state: ServiceState = ServiceState.NOT_STARTED
    last_check: Optional[float] = None
    last_success: Optional[float] = None
    error_message: Optional[str] = None
    retry_count: int = 0
    max_retries: int = 3
    next_retry: Optional[float] = None
    dependencies: List[str] = field(default_factory=list)
    details: Dict[str, Any] = field(default_factory=dict)

    # Enhanced initialization tracking
    user_friendly_name: str = ""
    current_phase: Optional[ServicePhase] = None
    initialization_log: List[str] = field(default_factory=list)


class ServiceManager:
    """
    Centralized service state management
    Tracks initialization and health of all system services
    """

    def __init__(self):
        self._services: Dict[str, ServiceStatus] = {
            "database": ServiceStatus(
                user_friendly_name="Local Database",
                dependencies=[],
                details={"type": "sqlite", "connection_timeout": 5},
            ),
            "typesense": ServiceStatus(
                user_friendly_name="Search Engine",
                dependencies=["database"],
                details={
                    "host": settings.typesense_host,
                    "port": settings.typesense_port,
                    "protocol": settings.typesense_protocol,
                },
            ),
            "tika": ServiceStatus(
                user_friendly_name="Content Extraction",
                dependencies=["database"],
                details={
                    "host": settings.tika_host,
                    "port": settings.tika_port,
                    "protocol": settings.tika_protocol,
                    "enabled": settings.tika_enabled,
                },
            ),
            "crawl_manager": ServiceStatus(
                user_friendly_name="File Indexer",
                dependencies=["database"],
                details={"components": ["discovery", "indexing"]},
            ),
        }
        self._lock = threading.RLock()
        self._health_checkers: Dict[str, callable] = {}
        self._initialization_threads: Dict[str, threading.Thread] = {}

    def register_health_checker(self, service_name: str, checker: callable):
        """Register a health check function for a service"""
        with self._lock:
            if service_name not in self._services:
                self._services[service_name] = ServiceStatus(user_friendly_name=service_name)
            self._health_checkers[service_name] = checker

    def get_service_status(self, service_name: str) -> Optional[ServiceStatus]:
        """Get current status of a specific service"""
        with self._lock:
            return self._services.get(service_name)

    def get_all_services_status(self) -> Dict[str, ServiceStatus]:
        """Get status of all services (thread-safe copy)"""
        with self._lock:
            return {name: status for name, status in self._services.items()}

    def set_service_phase(self, service_name: str, phase_name: str, progress_percent: float, message: str):
        """Update the current initialization phase for a service"""
        with self._lock:
            if service_name not in self._services:
                self._services[service_name] = ServiceStatus(user_friendly_name=service_name)

            status = self._services[service_name]
            status.current_phase = ServicePhase(
                phase_name=phase_name,
                progress_percent=progress_percent,
                message=message,
            )

            # Auto-update state to initializing if not already
            if status.state == ServiceState.NOT_STARTED:
                status.state = ServiceState.INITIALIZING

            self.append_service_log(service_name, f"Phase changed to '{phase_name}': {message}")

    def append_service_log(self, service_name: str, message: str):
        """Append a log message to the service's initialization log"""
        timestamp = datetime.now().strftime("%H:%M:%S")
        log_entry = f"[{timestamp}] {message}"

        with self._lock:
            if service_name in self._services:
                # Keep last 100 logs
                self._services[service_name].initialization_log.append(log_entry)
                if len(self._services[service_name].initialization_log) > 100:
                    self._services[service_name].initialization_log.pop(0)

    def get_service_logs(self, service_name: str, limit: int = 50) -> List[str]:
        """Get recent logs for a service"""
        with self._lock:
            if service_name in self._services:
                return self._services[service_name].initialization_log[-limit:]
            return []

    def update_service_state(
        self,
        service_name: str,
        state: ServiceState,
        error_message: Optional[str] = None,
        details: Optional[Dict] = None,
    ):
        """Update service state with timestamp"""
        with self._lock:
            if service_name not in self._services:
                self._services[service_name] = ServiceStatus(user_friendly_name=service_name)

            status = self._services[service_name]
            status.state = state
            status.last_check = time.time()

            if state == ServiceState.READY:
                status.last_success = time.time()
                status.retry_count = 0
                status.next_retry = None
                status.error_message = None
                # Clear phase info when ready
                status.current_phase = ServicePhase(
                    phase_name="Ready",
                    progress_percent=100.0,
                    message="Service is fully operational",
                )
                self.append_service_log(service_name, "Service is ready")
                logger.debug(f"Service {service_name} marked as ready at {status.last_success}")

            elif state == ServiceState.FAILED:
                status.error_message = error_message
                status.retry_count += 1

                if status.retry_count < status.max_retries:
                    # Exponential backoff for retries
                    backoff_seconds = min(2**status.retry_count, 300)  # Max 5 minutes
                    status.next_retry = time.time() + backoff_seconds
                    self.append_service_log(
                        service_name,
                        f"Failed (attempt {status.retry_count}): {error_message}",
                    )
                    logger.warning(f"Service {service_name} failed (attempt {status.retry_count}): {error_message}")
                else:
                    status.next_retry = None  # Max retries reached
                    self.append_service_log(service_name, f"Permanently failed: {error_message}")
                    logger.error(
                        f"Service {service_name} failed permanently after "
                        f"{status.max_retries} attempts: {error_message}"
                    )

            elif state == ServiceState.INITIALIZING:
                self.append_service_log(service_name, "Initialization started")
                logger.info(f"Service {service_name} started initialization")

            if details:
                status.details.update(details)

    def set_initializing(self, service_name: str, details: Optional[Dict] = None):
        """Mark service as initializing"""
        self.update_service_state(service_name, ServiceState.INITIALIZING, details=details)

    def set_ready(self, service_name: str, details: Optional[Dict] = None):
        """Mark service as ready"""
        self.update_service_state(service_name, ServiceState.READY, details=details)

    def set_failed(self, service_name: str, error_message: str, details: Optional[Dict] = None):
        """Mark service as failed"""
        self.update_service_state(
            service_name,
            ServiceState.FAILED,
            error_message=error_message,
            details=details,
        )

    def set_disabled(self, service_name: str, reason: str = None):
        """Mark service as disabled"""
        details = {"disabled_reason": reason} if reason else {}
        self.update_service_state(service_name, ServiceState.DISABLED, details=details)

    def set_busy(self, service_name: str, reason: str = "Processing"):
        """Mark service as busy (operational but temporarily unresponsive)"""
        with self._lock:
            if service_name in self._services:
                status = self._services[service_name]
                status.state = ServiceState.BUSY
                status.last_check = time.time()
                status.current_phase = ServicePhase(
                    phase_name="Busy",
                    progress_percent=50.0,
                    message=reason,
                )
                self.append_service_log(service_name, f"Service busy: {reason}")

    def reset_service_for_retry(self, service_name: str):
        """Reset service state and clear logs for a fresh retry attempt"""
        with self._lock:
            if service_name in self._services:
                status = self._services[service_name]
                # Clear logs
                status.initialization_log.clear()
                # Reset state to NOT_STARTED
                status.state = ServiceState.NOT_STARTED
                status.current_phase = None
                status.error_message = None
                logger.info(f"Service {service_name} reset for retry")

    def check_service_health(self, service_name: str) -> Dict[str, Any]:
        """Perform health check for a specific service"""
        with self._lock:
            if service_name not in self._services:
                return {
                    "status": "unknown",
                    "error": f"Service {service_name} not registered",
                }

            status = self._services[service_name]

            # Check if service is disabled
            if status.state == ServiceState.DISABLED:
                return {
                    "status": "disabled",
                    "message": status.details.get("disabled_reason", "Service disabled"),
                    "timestamp": status.last_check,
                }

            # Check if we need to retry
            if status.state == ServiceState.FAILED and status.next_retry and time.time() < status.next_retry:
                return {
                    "status": "retry_scheduled",
                    "message": f"Retry scheduled at {datetime.fromtimestamp(status.next_retry)}",
                    "retry_in_seconds": int(status.next_retry - time.time()),
                    "timestamp": status.last_check,
                }

            # Check if service is ready
            if status.state == ServiceState.READY:
                # If service has been marked as ready, consider it healthy
                # For services with health checkers, check if recent
                if service_name in self._health_checkers and status.last_success:
                    # If last success was within 30 seconds, consider it healthy
                    if time.time() - status.last_success < 30:
                        return {
                            "status": "healthy",
                            "timestamp": status.last_success,
                            "uptime_seconds": int(time.time() - status.last_success),
                        }
                    # If health checker exists but hasn't run recently, run it
                    else:
                        # Will run health checker below
                        pass
                else:
                    # Service is ready and has no health checker or recent check
                    # Consider it healthy based on its ready state
                    return {
                        "status": "healthy",
                        "timestamp": status.last_success or status.last_check,
                        "uptime_seconds": int(time.time() - (status.last_success or status.last_check)),
                    }

            # Perform actual health check if checker is registered
            if service_name in self._health_checkers:
                try:
                    checker = self._health_checkers[service_name]
                    result = checker()

                    if result.get("healthy", False):
                        # Check if service is busy (healthy but unresponsive)
                        if result.get("busy", False):
                            self.set_busy(service_name, result.get("message", "Processing"))
                            return {"status": "busy", "timestamp": time.time(), **result}
                        else:
                            self.set_ready(service_name, details=result)
                            return {"status": "healthy", "timestamp": time.time(), **result}
                    else:
                        self.set_failed(service_name, result.get("error", "Health check failed"))
                        return {
                            "status": "unhealthy",
                            "error": result.get("error", "Health check failed"),
                            "timestamp": time.time(),
                            **result,
                        }

                except Exception as e:
                    error_msg = f"Health check error: {str(e)}"
                    self.set_failed(service_name, error_msg)
                    return {
                        "status": "error",
                        "error": error_msg,
                        "timestamp": time.time(),
                    }

            else:
                # No health checker registered, return current state
                return {
                    "status": status.state.value,
                    "message": status.error_message,
                    "timestamp": status.last_check,
                    "retry_count": status.retry_count,
                }

    def check_all_services_health(self) -> Dict[str, Any]:
        """Check health of all services"""
        results = {}
        for service_name in self._services.keys():
            results[service_name] = self.check_service_health(service_name)

        # Calculate overall system health
        healthy_count = sum(1 for result in results.values() if result.get("status") == "healthy")
        total_count = len(results)

        overall_status = "healthy"
        if healthy_count == 0:
            overall_status = "critical"
        elif healthy_count < total_count:
            overall_status = "degraded"

        return {
            "overall_status": overall_status,
            "services": results,
            "summary": {
                "total_services": total_count,
                "healthy_services": healthy_count,
                "failed_services": total_count - healthy_count,
            },
            "timestamp": time.time(),
        }

    def get_dependency_status(self, service_name: str) -> Dict[str, Any]:
        """Check if all dependencies of a service are ready"""
        with self._lock:
            if service_name not in self._services:
                return {"ready": False, "error": f"Service {service_name} not found"}

            status = self._services[service_name]
            dependency_results = {}
            all_ready = True

            for dep in status.dependencies:
                if dep not in self._services:
                    dependency_results[dep] = {
                        "ready": False,
                        "error": "Dependency not registered",
                    }
                    all_ready = False
                else:
                    dep_status = self._services[dep]
                    dependency_results[dep] = {"ready": dep_status.state == ServiceState.READY}
                    if dep_status.state != ServiceState.READY:
                        all_ready = False

            return {"ready": all_ready, "dependencies": dependency_results}

    def start_background_initialization(
        self,
        service_name: str,
        init_func: callable,
        dependencies: Optional[List[str]] = None,
    ):
        """Start initialization of a service in the background"""
        if dependencies:
            with self._lock:
                if service_name not in self._services:
                    self._services[service_name] = ServiceStatus(user_friendly_name=service_name)
                self._services[service_name].dependencies = dependencies

        # Create and start the initialization thread
        thread = threading.Thread(
            target=self._initialize_service_background,
            args=(service_name, init_func),
            daemon=True,
            name=f"init_{service_name}",
        )
        thread.start()
        with self._lock:
            self._initialization_threads[service_name] = thread

    def _initialize_service_background(self, service_name: str, init_func: callable):
        """Background thread to initialize a service"""
        try:
            logger.info(f"Starting background initialization for {service_name}")
            self.set_initializing(service_name)

            self.set_service_phase(
                service_name,
                "Waiting for Dependencies",
                0,
                "Wait for dependencies to be ready",
            )

            # Check dependencies first
            dep_status = self.get_dependency_status(service_name)
            if not dep_status["ready"]:
                # Wait for dependencies with timeout
                start_wait = time.time()
                while time.time() - start_wait < 60:  # 60s timeout for dependencies
                    time.sleep(1)
                    dep_status = self.get_dependency_status(service_name)
                    if dep_status["ready"]:
                        break

                if not dep_status["ready"]:
                    missing_deps = [dep for dep, status in dep_status["dependencies"].items() if not status["ready"]]
                    raise Exception(f"Dependencies timed out: {missing_deps}")

            self.set_service_phase(service_name, "Initializing", 10, "Starting initialization sequence")

            # Run the initialization function (now always sync)
            result = init_func()

            self.set_ready(service_name, details={"initialization_result": result})
            logger.info(f"Background initialization completed for {service_name}")

        except Exception as e:
            error_msg = f"Background initialization failed for {service_name}: {str(e)}"
            logger.error(error_msg)
            self.set_failed(service_name, error_msg)

        finally:
            # Clean up the thread
            with self._lock:
                if service_name in self._initialization_threads:
                    del self._initialization_threads[service_name]

    def wait_for_service(self, service_name: str, timeout: float = 30.0) -> bool:
        """Wait for a service to become ready with timeout"""
        start_time = time.time()
        while time.time() - start_time < timeout:
            status = self.get_service_status(service_name)
            if status and status.state == ServiceState.READY:
                return True
            elif status and status.state == ServiceState.FAILED:
                return False

            time.sleep(0.5)  # Check every 500ms

        return False

    def is_service_ready(self, service_name: str) -> bool:
        """Check if a service is ready (synchronous)"""
        with self._lock:
            status = self._services.get(service_name)
            return status is not None and status.state == ServiceState.READY


# Global service manager instance
_service_manager: Optional[ServiceManager] = None


def get_service_manager() -> ServiceManager:
    """Get the global service manager instance"""
    global _service_manager
    if _service_manager is None:
        _service_manager = ServiceManager()
    return _service_manager


def is_service_ready(service_name: str) -> bool:
    """Convenience function to check if a service is ready"""
    return get_service_manager().is_service_ready(service_name)


def require_service(service_name: str) -> bool:
    """Check if a service is ready, raise exception if not"""
    if not is_service_ready(service_name):
        from fastapi import HTTPException

        status = get_service_manager().get_service_status(service_name)
        if status and status.state == ServiceState.INITIALIZING:
            raise HTTPException(status_code=503, detail=f"Service {service_name} is initializing")
        elif status and status.state == ServiceState.FAILED:
            raise HTTPException(
                status_code=503,
                detail=f"Service {service_name} failed: {status.error_message}",
            )
        else:
            raise HTTPException(status_code=503, detail=f"Service {service_name} is not available")
    return True
