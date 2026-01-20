"""
System API endpoints for initialization status and service management
"""

import time

from fastapi import APIRouter, HTTPException

from file_brain.core.logging import logger
from file_brain.services.service_manager import get_service_manager

router = APIRouter(prefix="/system", tags=["system"])


@router.get("/initialization")
def get_initialization_status():
    """Get detailed system initialization status"""
    try:
        service_manager = get_service_manager()
        services_health = service_manager.check_all_services_health()

        # Calculate initialization progress
        total_services = len(services_health["services"])
        ready_services = sum(
            1 for service in services_health["services"].values() if service.get("status") == "healthy"
        )

        initialization_progress = (ready_services / total_services) * 100 if total_services > 0 else 0

        # Determine if system is ready for different operations
        services_status = services_health["services"]

        search_available = services_status.get("typesense", {}).get("status") == "healthy"
        crawl_available = services_status.get("crawl_manager", {}).get("status") == "healthy" and search_available
        configuration_available = services_status.get("database", {}).get("status") == "healthy"

        # Determine status message
        if initialization_progress >= 100:
            message = "All services initialized successfully. System fully operational."
        elif services_health["overall_status"] == "critical":
            message = "Critical services failed to initialize. System functionality is limited."
        elif services_health["overall_status"] == "degraded":
            message = "System is operational but some services are still initializing or failed to start."
        else:
            message = f"System is initializing... {initialization_progress:.1f}% complete."

        return {
            "timestamp": int(time.time() * 1000),
            "overall_status": services_health["overall_status"],
            "initialization_progress": round(initialization_progress, 1),
            "services": services_health["services"],
            "summary": services_health["summary"],
            "capabilities": {
                "configuration_api": configuration_available,
                "search_api": search_available,
                "crawl_api": crawl_available,
                "full_functionality": initialization_progress == 100.0,
            },
            "degraded_mode": services_health["overall_status"] in ["degraded", "critical"],
            "message": message,
        }

    except Exception as e:
        logger.error(f"Error getting initialization status: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/services")
def get_services_status():
    """Get detailed status of all registered services"""
    try:
        service_manager = get_service_manager()

        all_services = service_manager.get_all_services_status()
        services_status = {}

        for service_name, status in all_services.items():
            health_check = service_manager.check_service_health(service_name)
            services_status[service_name] = {
                "state": status.state.value,
                "last_check": status.last_check,
                "last_success": status.last_success,
                "error_message": status.error_message,
                "retry_count": status.retry_count,
                "max_retries": status.max_retries,
                "next_retry": status.next_retry,
                "dependencies": status.dependencies,
                "details": status.details,
                "health_check": health_check,
            }

        return {"timestamp": int(time.time() * 1000), "services": services_status}

    except Exception as e:
        logger.error(f"Error getting services status: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/services/{service_name}/retry")
def retry_service_initialization(service_name: str):
    """Manually retry initialization of a failed service"""
    try:
        from file_brain.services.service_manager import ServiceState

        service_manager = get_service_manager()
        service_status = service_manager.get_service_status(service_name)

        if not service_status:
            raise HTTPException(status_code=404, detail=f"Service {service_name} not found")

        if service_status.state == ServiceState.READY:
            raise HTTPException(status_code=400, detail=f"Service {service_name} is already ready")

        # Reset failed state to trigger retry
        service_manager.set_initializing(service_name, details={"manual_retry": True})

        logger.info(f"Manual retry initiated for service: {service_name}")

        return {
            "message": f"Retry initiated for service: {service_name}",
            "timestamp": int(time.time() * 1000),
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error retrying service {service_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/services/{service_name}/logs")
def get_service_logs(service_name: str, limit: int = 100):
    """Get initialization logs for a specific service"""
    try:
        service_manager = get_service_manager()
        logs = service_manager.get_service_logs(service_name, limit)

        return {
            "service": service_name,
            "logs": logs,
            "timestamp": int(time.time() * 1000),
        }
    except Exception as e:
        logger.error(f"Error getting service logs: {e}")
        raise HTTPException(status_code=500, detail=str(e))
