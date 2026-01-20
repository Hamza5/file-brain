"""
Application Initialization Module

Handles critical and background initialization for File Brain services.
Extracted from main.py to improve maintainability.
"""

import time

from file_brain.core.config import settings
from file_brain.core.logging import logger
from file_brain.database.models import db_session, init_db, init_default_data
from file_brain.database.repositories import CrawlerStateRepository, WatchPathRepository
from file_brain.services.crawler.manager import get_crawl_job_manager
from file_brain.services.service_manager import get_service_manager
from file_brain.services.typesense_client import get_typesense_client


def register_all_health_checkers():
    """
    Register health check functions for all services at startup.
    This makes health checks work independently of wizard completion.
    """
    service_manager = get_service_manager()

    # Database health check
    def database_health_check():
        try:
            from sqlalchemy import text

            with db_session() as db:
                db.execute(text("SELECT 1"))
            return {"healthy": True, "type": "sqlite"}
        except Exception as e:
            return {"healthy": False, "error": str(e)}

    service_manager.register_health_checker("database", database_health_check)

    # Typesense health check
    def typesense_health_check():
        try:
            typesense = get_typesense_client()
            typesense.get_collection_stats()
            return {"healthy": True, "collection": typesense.collection_name}
        except Exception as e:
            return {"healthy": False, "error": str(e)}

    service_manager.register_health_checker("typesense", typesense_health_check)

    # Tika health check
    if settings.tika_enabled:

        def tika_health_check():
            try:
                import httpx

                with httpx.Client(timeout=30.0) as client:
                    response = client.get(f"{settings.tika_url}/version")
                    if response.status_code == 200:
                        return {
                            "healthy": True,
                            "endpoint": settings.tika_url,
                            "client_only": settings.tika_client_only,
                        }
                    return {
                        "healthy": False,
                        "error": f"Tika server returned status {response.status_code}",
                    }
            except httpx.TimeoutException:
                # On timeout, mark as busy rather than failed
                # Tika may be processing large files and unable to respond to health checks
                return {
                    "healthy": True,
                    "busy": True,
                    "message": "Processing (may be handling large files)",
                }
            except Exception as e:
                return {"healthy": False, "error": str(e)}

        service_manager.register_health_checker("tika", tika_health_check)
    else:
        service_manager.set_disabled("tika", "Tika extraction disabled in settings")

    # Crawl manager health check
    def crawl_manager_health_check():
        try:
            crawl_manager = get_crawl_job_manager()
            return {"healthy": True, "running": crawl_manager.is_running()}
        except Exception as e:
            return {"healthy": False, "error": str(e)}

    service_manager.register_health_checker("crawl_manager", crawl_manager_health_check)

    logger.info("✅ All health checkers registered")


def critical_init():
    """
    Critical initialization that MUST complete before FastAPI startup.
    Initializes database and starts Docker containers if wizard is completed.
    """
    service_manager = get_service_manager()

    try:
        logger.info("Initializing database...")
        init_db()
        with db_session() as db:
            init_default_data(db)

        # Register all health checkers at startup
        register_all_health_checkers()

        service_manager.set_ready("database", details={"type": "sqlite", "tables": "created"})
        logger.info("✅ Database initialized")

        # Note: Docker containers are now started via API after UI loads (deferred startup)
        # This improves app startup time by showing the UI immediately
        from file_brain.database.repositories import WizardStateRepository

        with db_session() as db:
            wizard_repo = WizardStateRepository(db)
            wizard_state = wizard_repo.get()

        if wizard_state and wizard_state.wizard_completed:
            logger.info("🐳 Wizard completed - containers will start after UI loads")
        else:
            logger.info("🧪 Wizard not completed - Docker containers will start via wizard")

    except Exception as e:
        service_manager.set_failed("database", f"Database initialization failed: {e}")
        raise

    return {
        "database": "ready",
        "message": "Database initialized. Complete wizard to initialize remaining services.",
    }


def init_typesense_for_wizard():
    """
    Initialize Typesense for wizard (wizard-controlled).
    Returns success status and error message if any.
    """
    from file_brain.services.service_manager import get_service_manager

    service_manager = get_service_manager()

    try:
        logger.info("Initializing Typesense...")
        typesense = get_typesense_client()

        typesense.initialize_collection()
        if typesense.collection_ready:
            service_manager.set_ready(
                "typesense",
                details={
                    "collection": typesense.collection_name,
                    "host": settings.typesense_host,
                },
            )
            logger.info("✅ Typesense initialized")
            return {"success": True}
        else:
            service_manager.set_failed("typesense", "Collection initialization failed")
            return {"success": False, "error": "Collection initialization failed"}

    except Exception as e:
        error_msg = f"Typesense initialization error: {e}"
        service_manager.set_failed("typesense", error_msg)
        logger.error(error_msg)
        return {"success": False, "error": error_msg}


def init_tika_for_wizard():
    """
    Initialize Tika for wizard (wizard-controlled).
    Returns success status and error message if any.
    """
    from file_brain.services.service_manager import get_service_manager

    service_manager = get_service_manager()

    if not settings.tika_enabled:
        service_manager.set_disabled("tika", "Tika extraction disabled in settings")
        return {"success": True, "disabled": True}

    try:
        logger.info("Initializing Tika...")

        service_manager.set_ready(
            "tika",
            details={
                "endpoint": settings.tika_url,
                "client_only": settings.tika_client_only,
                "enabled": settings.tika_enabled,
            },
        )
        logger.info("✅ Tika initialized")
        return {"success": True}

    except Exception as e:
        error_msg = f"Tika initialization error: {e}"
        service_manager.set_failed("tika", error_msg)
        logger.error(error_msg)
        return {"success": False, "error": error_msg}


def init_crawl_manager_for_wizard():
    """
    Initialize crawl manager for wizard (wizard-controlled).
    Returns success status and error message if any.
    """
    from file_brain.services.service_manager import get_service_manager

    service_manager = get_service_manager()

    try:
        logger.info("Initializing crawl manager...")

        with db_session() as db:
            watch_path_repo = WatchPathRepository(db)
            crawler_state_repo = CrawlerStateRepository(db)
            watch_paths = watch_path_repo.get_enabled()
            previous_state = crawler_state_repo.get_state()

        crawl_manager = get_crawl_job_manager(watch_paths=watch_paths)

        def crawl_manager_health_check():
            return {"healthy": True, "running": crawl_manager.is_running()}

        service_manager.register_health_checker("crawl_manager", crawl_manager_health_check)

        service_manager.set_ready(
            "crawl_manager",
            details={
                "watch_paths_count": len(watch_paths) if watch_paths else 0,
                "previous_state": {
                    "crawl_job_running": previous_state.crawl_job_running,
                    "crawl_job_type": previous_state.crawl_job_type,
                },
            },
        )

        logger.info("✅ Crawl manager initialized")

        # Auto-resume if there was a previous crawl
        if watch_paths and previous_state.crawl_job_running:
            logger.info("🔄 Detected previous in-progress crawl job; auto-resuming...")
            success = crawl_manager.start_crawl()
            if success:
                logger.info("✅ Auto-resumed crawl based on previous state.")
            else:
                logger.warning("⚠️ Failed to auto-resume crawl from previous state.")

        return {"success": True}

    except Exception as e:
        error_msg = f"Crawl manager initialization error: {e}"
        service_manager.set_failed("crawl_manager", error_msg)
        logger.error(error_msg)
        return {"success": False, "error": error_msg}


def health_monitoring_loop():
    """Background health monitoring loop."""
    from file_brain.database.repositories import WizardStateRepository
    from file_brain.services.service_manager import get_service_manager

    service_manager = get_service_manager()
    while True:
        try:
            # OPTIMIZATION: Skip health checks if wizard not completed
            # This prevents repeated failed connection attempts to Typesense/Tika
            # during initial setup when Docker containers aren't running yet
            with db_session() as db:
                wizard_state = WizardStateRepository(db).get()
                if not wizard_state or not wizard_state.wizard_completed:
                    time.sleep(30)
                    continue

            service_manager.check_all_services_health()
            time.sleep(30)
        except Exception as e:
            logger.error(f"Health monitoring loop error: {e}")
            time.sleep(60)
