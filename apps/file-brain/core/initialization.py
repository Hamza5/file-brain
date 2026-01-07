"""
Application Initialization Module

Handles critical and background initialization for File Brain services.
Extracted from main.py to improve maintainability.
"""

import asyncio

from core.config import settings
from core.logging import logger
from database.models import db_session, init_db, init_default_data
from database.repositories import CrawlerStateRepository, WatchPathRepository
from services.crawler.manager import get_crawl_job_manager
from services.service_manager import get_service_manager
from services.typesense_client import get_typesense_client


async def register_all_health_checkers():
    """
    Register health check functions for all services at startup.
    This makes health checks work independently of wizard completion.
    """
    service_manager = get_service_manager()

    # Database health check
    async def database_health_check():
        try:
            from sqlalchemy import text

            with db_session() as db:
                db.execute(text("SELECT 1"))
            return {"healthy": True, "type": "sqlite"}
        except Exception as e:
            return {"healthy": False, "error": str(e)}

    service_manager.register_health_checker("database", database_health_check)

    # Typesense health check
    async def typesense_health_check():
        try:
            typesense = get_typesense_client()
            await typesense.get_collection_stats()
            return {"healthy": True, "collection": typesense.collection_name}
        except Exception as e:
            return {"healthy": False, "error": str(e)}

    service_manager.register_health_checker("typesense", typesense_health_check)

    # Tika health check
    if settings.tika_enabled:

        async def tika_health_check():
            try:
                import aiohttp

                async with aiohttp.ClientSession() as session:
                    async with session.get(
                        f"{settings.tika_url}/version",
                        timeout=aiohttp.ClientTimeout(total=5),
                    ) as response:
                        if response.status == 200:
                            return {
                                "healthy": True,
                                "endpoint": settings.tika_url,
                                "client_only": settings.tika_client_only,
                            }
                        return {
                            "healthy": False,
                            "error": f"Tika server returned status {response.status}",
                        }
            except Exception as e:
                return {"healthy": False, "error": str(e)}

        service_manager.register_health_checker("tika", tika_health_check)
    else:
        service_manager.set_disabled("tika", "Tika extraction disabled in settings")

    # Crawl manager health check
    async def crawl_manager_health_check():
        try:
            crawl_manager = get_crawl_job_manager()
            return {"healthy": True, "running": crawl_manager.is_running()}
        except Exception as e:
            return {"healthy": False, "error": str(e)}

    service_manager.register_health_checker("crawl_manager", crawl_manager_health_check)

    logger.info("✅ All health checkers registered")


async def critical_init():
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
        await register_all_health_checkers()

        service_manager.set_ready("database", details={"type": "sqlite", "tables": "created"})
        logger.info("✅ Database initialized")

        # Auto-start Docker containers if wizard is completed
        from database.repositories import WizardStateRepository
        from services.docker_manager import get_docker_manager

        with db_session() as db:
            wizard_repo = WizardStateRepository(db)
            wizard_state = wizard_repo.get()

        if wizard_state and wizard_state.wizard_completed:
            logger.info("🐳 Wizard completed - auto-starting Docker containers...")
            docker_manager = get_docker_manager()

            # Start Docker services (will fail gracefully if Docker not available)
            start_result = await docker_manager.start_services()
            if start_result.get("success"):
                logger.info("✅ Docker containers started successfully")
            else:
                logger.warning(f"⚠️ Failed to start Docker containers: {start_result.get('error')}")
        else:
            logger.info("🧪 Wizard not completed - Docker containers will start via wizard")

    except Exception as e:
        service_manager.set_failed("database", f"Database initialization failed: {e}")
        raise

    return {
        "database": "ready",
        "message": "Database initialized. Complete wizard to initialize remaining services.",
    }


async def init_typesense_for_wizard():
    """
    Initialize Typesense for wizard (wizard-controlled).
    Returns success status and error message if any.
    """
    from services.service_manager import get_service_manager

    service_manager = get_service_manager()

    try:
        logger.info("Initializing Typesense...")
        typesense = get_typesense_client()

        await typesense.initialize_collection()
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


async def init_tika_for_wizard():
    """
    Initialize Tika for wizard (wizard-controlled).
    Returns success status and error message if any.
    """
    from services.service_manager import get_service_manager

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


async def init_crawl_manager_for_wizard():
    """
    Initialize crawl manager for wizard (wizard-controlled).
    Returns success status and error message if any.
    """
    from services.service_manager import get_service_manager

    service_manager = get_service_manager()

    try:
        logger.info("Initializing crawl manager...")

        with db_session() as db:
            watch_path_repo = WatchPathRepository(db)
            crawler_state_repo = CrawlerStateRepository(db)
            watch_paths = watch_path_repo.get_enabled()
            previous_state = crawler_state_repo.get_state()

        crawl_manager = get_crawl_job_manager(watch_paths=watch_paths)

        async def crawl_manager_health_check():
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
            success = await crawl_manager.start_crawl()
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


async def health_monitoring_loop():
    """Background health monitoring loop."""
    from services.service_manager import get_service_manager

    service_manager = get_service_manager()
    while True:
        try:
            await service_manager.check_all_services_health()
            await asyncio.sleep(30)
        except Exception as e:
            logger.error(f"Health monitoring loop error: {e}")
            await asyncio.sleep(60)
