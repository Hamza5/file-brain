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
from services.typesense_client import get_typesense_client


async def critical_init():
    """
    Critical initialization that MUST complete before FastAPI startup.
    Initializes database and registers health check.
    """
    from services.service_manager import get_service_manager

    service_manager = get_service_manager()

    try:
        logger.info("Initializing database...")
        init_db()
        with db_session() as db:
            init_default_data(db)

        async def database_health_check():
            try:
                from sqlalchemy import text

                with db_session() as db:
                    db.execute(text("SELECT 1"))
                return {"healthy": True, "type": "sqlite"}
            except Exception as e:
                return {"healthy": False, "error": str(e)}

        service_manager.register_health_checker("database", database_health_check)
        service_manager.set_ready("database", details={"type": "sqlite", "tables": "created"})
        logger.info("✅ Database initialized")
    except Exception as e:
        service_manager.set_failed("database", f"Database initialization failed: {e}")
        raise

    return {
        "database": "ready",
        "message": "Critical services initialized, background services starting...",
    }


async def background_init():
    """
    Background initialization that does NOT block FastAPI startup.
    Initiates Typesense, Tika, and Crawl Manager services.
    """
    from services.service_manager import get_service_manager

    service_manager = get_service_manager()

    # Typesense initialization
    await _init_typesense(service_manager)

    # Tika initialization
    await _init_tika(service_manager)

    # Crawl Manager initialization
    await _init_crawl_manager(service_manager)


async def _init_typesense(service_manager):
    """Initialize Typesense search engine."""
    try:
        logger.info("Starting Typesense initialization in background...")
        typesense = get_typesense_client()

        async def typesense_health_check():
            try:
                await typesense.get_collection_stats()
                return {"healthy": True, "collection": typesense.collection_name}
            except Exception as e:
                return {"healthy": False, "error": str(e)}

        service_manager.register_health_checker("typesense", typesense_health_check)

        async def init_typesense():
            try:
                await typesense.initialize_collection()
                if typesense.collection_ready:
                    service_manager.set_ready(
                        "typesense",
                        details={
                            "collection": typesense.collection_name,
                            "host": settings.typesense_host,
                        },
                    )
                    logger.info("✅ Typesense initialized in background")
                else:
                    service_manager.set_failed("typesense", "Collection initialization failed")
            except Exception as e:
                service_manager.set_failed("typesense", f"Typesense initialization error: {e}")

        service_manager.start_background_initialization("typesense", init_typesense, dependencies=["database"])

    except Exception as e:
        service_manager.set_failed("typesense", f"Typesense setup error: {e}")


async def _init_tika(service_manager):
    """Initialize Apache Tika extraction service."""
    if not settings.tika_enabled:
        service_manager.set_disabled("tika", "Tika extraction disabled in settings")
        return

    try:
        logger.info("Starting Tika initialization in background...")

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

        async def init_tika():
            service_manager.set_ready(
                "tika",
                details={
                    "endpoint": settings.tika_url,
                    "client_only": settings.tika_client_only,
                    "enabled": settings.tika_enabled,
                },
            )
            logger.info("✅ Tika initialized in background")

        service_manager.start_background_initialization("tika", init_tika, dependencies=["database"])

    except Exception as e:
        service_manager.set_failed("tika", f"Tika setup error: {e}")


async def _init_crawl_manager(service_manager):
    """Initialize the crawl job manager."""
    try:
        logger.info("Starting crawl manager initialization in background...")

        async def init_crawl_manager():
            try:
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

                logger.info("✅ Crawl manager initialized in background")
                if watch_paths:
                    await auto_resume_logic(watch_paths, previous_state)

            except Exception as e:
                service_manager.set_failed("crawl_manager", f"Crawl manager initialization error: {e}")

        service_manager.start_background_initialization("crawl_manager", init_crawl_manager, dependencies=["database"])

    except Exception as e:
        service_manager.set_failed("crawl_manager", f"Crawl manager setup error: {e}")


async def auto_resume_logic(watch_paths, previous_state):
    """Background auto-resume logic for interrupted crawls."""
    try:
        await asyncio.sleep(2)
        if watch_paths and previous_state.crawl_job_running:
            logger.info("🔄 Detected previous in-progress crawl job; auto-resuming...")
            crawl_manager = get_crawl_job_manager(watch_paths=watch_paths)
            success = await crawl_manager.start_crawl()
            if success:
                logger.info("✅ Auto-resumed crawl based on previous state.")
            else:
                logger.warning("⚠️ Failed to auto-resume crawl from previous state.")
    except Exception as e:
        logger.error(f"Auto-resume logic failed: {e}")


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
