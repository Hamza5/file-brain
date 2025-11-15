"""
Smart File Finder - Advanced file search engine powered by AI
"""
import asyncio
from datetime import datetime
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.responses import JSONResponse

from config.settings import settings
from database.models import init_db, init_default_data, SessionLocal
from services.database_service import DatabaseService
from services.typesense_client import get_typesense_client
from services.crawl_job_manager import get_crawl_job_manager
from api.crawler import router as crawler_router
from api.configuration import router as config_router
from api.fs import router as fs_router
from utils.logger import logger


async def critical_init():
    """
    Critical initialization that MUST complete before FastAPI startup
    This includes only the essential services for API functionality
    """
    from services.service_manager import get_service_manager, ServiceState
    
    service_manager = get_service_manager()
    
    # Database initialization (CRITICAL - blocks startup)
    try:
        logger.info("Initializing database...")
        init_db()
        db = SessionLocal()
        init_default_data(db)
        db.close()
        
        # Register database health checker
        async def database_health_check():
            try:
                from sqlalchemy import text
                test_db = SessionLocal()
                test_db.execute(text("SELECT 1"))
                test_db.close()
                return {"healthy": True, "type": "sqlite"}
            except Exception as e:
                return {"healthy": False, "error": str(e)}
        
        service_manager.register_health_checker("database", database_health_check)
        service_manager.set_ready("database", details={"type": "sqlite", "tables": "created"})
        logger.info("✅ Database initialized")
    except Exception as e:
        service_manager.set_failed("database", f"Database initialization failed: {e}")
        raise  # This blocks startup - database is required

    return {
        "database": "ready",
        "message": "Critical services initialized, background services starting..."
    }

async def background_init():
    """
    Background initialization that does NOT block FastAPI startup
    These services can fail or be slow without affecting API availability
    """
    from services.service_manager import get_service_manager
    from services.database_service import DatabaseService
    from services.crawl_job_manager import get_crawl_job_manager
    from database.models import SessionLocal
    
    service_manager = get_service_manager()
    
    # Typesense initialization (non-blocking)
    try:
        logger.info("Starting Typesense initialization in background...")
        typesense = get_typesense_client()
        
        # Register Typesense health checker
        async def typesense_health_check():
            try:
                await typesense.get_collection_stats()
                return {"healthy": True, "collection": typesense.collection_name}
            except Exception as e:
                return {"healthy": False, "error": str(e)}
        
        service_manager.register_health_checker("typesense", typesense_health_check)
        
        # Start background initialization
        async def init_typesense():
            try:
                await typesense.initialize_collection()
                if typesense.collection_ready:
                    service_manager.set_ready("typesense", details={
                        "collection": typesense.collection_name,
                        "host": settings.typesense_host
                    })
                    logger.info("✅ Typesense initialized in background")
                else:
                    service_manager.set_failed("typesense", "Collection initialization failed")
            except Exception as e:
                service_manager.set_failed("typesense", f"Typesense initialization error: {e}")
        
        service_manager.start_background_initialization("typesense", init_typesense, dependencies=["database"])
        
    except Exception as e:
        service_manager.set_failed("typesense", f"Typesense setup error: {e}")
    
    # Crawl Manager initialization (non-blocking)
    try:
        logger.info("Starting crawl manager initialization in background...")
        
        async def init_crawl_manager():
            try:
                # Initialize crawl manager
                crawl_manager = get_crawl_job_manager()
                
                # Register crawl manager health checker
                async def crawl_manager_health_check():
                    try:
                        status = crawl_manager.get_status()
                        return {
                            "healthy": True,
                            "running": status.get("running", False),
                            "queue_size": status.get("queue_size", 0)
                        }
                    except Exception as e:
                        return {"healthy": False, "error": str(e)}
                
                service_manager.register_health_checker("crawl_manager", crawl_manager_health_check)
                
                # Get configuration from database for potential auto-resume
                db = SessionLocal()
                db_service = DatabaseService(db)
                watch_paths = db_service.get_watch_paths(enabled_only=True)
                previous_state = db_service.get_crawler_state()
                
                service_manager.set_ready("crawl_manager", details={
                    "watch_paths_count": len(watch_paths) if watch_paths else 0,
                    "previous_state": {
                        "crawl_job_running": previous_state.crawl_job_running,
                        "crawl_job_type": previous_state.crawl_job_type,
                        "watcher_running": previous_state.watcher_running
                    }
                })
                
                logger.info("✅ Crawl manager initialized in background")
                logger.info(f"📁 Watch paths: {len(watch_paths) if watch_paths else 0} configured")
                
                # Auto-resume logic moved to separate background task
                if watch_paths:
                    await auto_resume_logic(watch_paths, previous_state)
                
                db.close()
                
            except Exception as e:
                service_manager.set_failed("crawl_manager", f"Crawl manager initialization error: {e}")
        
        service_manager.start_background_initialization("crawl_manager", init_crawl_manager, dependencies=["database"])
        
        # File Watcher initialization (non-blocking)
        try:
            logger.info("Starting file watcher initialization in background...")
            
            async def init_file_watcher():
                try:
                    # Register file watcher health checker
                    async def file_watcher_health_check():
                        try:
                            # Simple health check - verify watchdog library is available
                            import watchdog.observers
                            import watchdog.events
                            return {"healthy": True, "library": "watchdog", "version": "available"}
                        except ImportError as e:
                            return {"healthy": False, "error": f"watchdog library not available: {str(e)}"}
                        except Exception as e:
                            return {"healthy": False, "error": str(e)}
                    
                    service_manager.register_health_checker("file_watcher", file_watcher_health_check)
                    service_manager.set_ready("file_watcher", details={"library": "watchdog", "initialized": True})
                    logger.info("✅ File watcher initialized in background")
                    
                except Exception as e:
                    service_manager.set_failed("file_watcher", f"File watcher initialization error: {e}")
            
            service_manager.start_background_initialization("file_watcher", init_file_watcher, dependencies=["database"])
            
        except Exception as e:
            service_manager.set_failed("file_watcher", f"File watcher setup error: {e}")
        
    except Exception as e:
        service_manager.set_failed("crawl_manager", f"Crawl manager setup error: {e}")


async def auto_resume_logic(watch_paths, previous_state):
    """
    Background auto-resume logic that runs after all services are initialized
    """
    from services.crawl_job_manager import get_crawl_job_manager
    
    try:
        logger.info("Starting auto-resume logic in background...")
        
        # Wait a bit for services to be fully ready
        await asyncio.sleep(2)
        
        auto_resumed = False
        if watch_paths:
            cj_type = (previous_state.crawl_job_type or "").lower() if previous_state.crawl_job_type else ""
            
            if previous_state.crawl_job_running:
                # Previous session reported an active crawl job; treat as needing full resume.
                logger.info(
                    "🔄 Detected previous in-progress crawl job; "
                    "auto-resuming with crawl+monitor."
                )
                crawl_manager = get_crawl_job_manager()
                success = await crawl_manager.start_crawl(
                    watch_paths,
                    start_monitoring=True,
                    include_subdirectories=True,
                )
                if success:
                    logger.info("✅ Auto-resumed crawl+monitor based on previous state.")
                    auto_resumed = True
                else:
                    logger.warning("⚠️ Failed to auto-resume crawl+monitor from previous state.")
            
            elif (not previous_state.crawl_job_running) and previous_state.watcher_running:
                # No active crawl job flag, but watcher was running -> monitor-only session.
                logger.info(
                    "🔄 Detected previous monitor-only session; "
                    "auto-resuming monitor-only (no full re-crawl)."
                )
                # Implement monitor-only by starting a crawl with monitoring enabled.
                # Discovery will run, but Typesense/file_hash logic keeps this idempotent.
                crawl_manager = get_crawl_job_manager()
                success = await crawl_manager.start_crawl(
                    watch_paths,
                    start_monitoring=True,
                    include_subdirectories=True,
                )
                if success:
                    logger.info("✅ Auto-resumed monitor-only (crawl+monitor) based on previous watcher state.")
                    auto_resumed = True
                else:
                    logger.warning("⚠️ Failed to auto-resume monitor-only from previous state.")
        
        if not auto_resumed:
            if watch_paths:
                logger.info("📁 Watch paths configured but no auto-resume conditions met.")
                logger.info("💡 Use /api/crawler/start to manually start crawling or monitoring.")
            else:
                logger.info(
                    "ℹ️ No watch paths configured. "
                    "Add paths via /api/config/watch-paths and /api/config/watch-paths/batch"
                )
        
    except Exception as e:
        logger.error(f"Auto-resume logic failed: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application lifespan manager with instant startup
    Critical services block startup, non-critical services initialize in background
    """
    # Startup - CRITICAL PATH (must complete quickly)
    logger.info("=" * 50)
    logger.info(f"Starting {settings.app_name} v{settings.app_version}")
    logger.info("=" * 50)
    
    try:
        # CRITICAL: Database initialization (blocks startup until complete)
        await critical_init()
        logger.info("🚀 Critical services ready - API starting immediately!")
        
        # NON-CRITICAL: Start background initialization (doesn't block)
        asyncio.create_task(background_init())
        
        # Start health monitoring background task
        asyncio.create_task(health_monitoring_loop())
        
        logger.info("=" * 50)
        logger.info("✅ FastAPI startup complete - background services initializing...")
        logger.info(f"🔍 Search engine: {settings.typesense_url}")
        logger.info(f"⚙️  Configuration API: /api/config")
        logger.info("=" * 50)
        
    except Exception as e:
        logger.error(f"❌ Critical initialization failed: {e}")
        raise  # This blocks startup - critical services failed
    
    yield
    
    # Shutdown
    logger.info("=" * 50)
    logger.info("Shutting down...")
    logger.info("=" * 50)
    
    try:
        # Stop crawl manager
        logger.info("Stopping crawl manager...")
        crawl_manager = get_crawl_job_manager()
        if crawl_manager.is_running():
            await crawl_manager.stop_crawl()
            logger.info("✅ Crawl manager stopped")
        
    except Exception as e:
        logger.error(f"Error during shutdown: {e}")
    
    logger.info("=" * 50)
    logger.info("👋 Application shutdown complete")
    logger.info("=" * 50)


async def health_monitoring_loop():
    """
    Background task that periodically checks service health and updates status
    """
    from services.service_manager import get_service_manager
    
    service_manager = get_service_manager()
    
    while True:
        try:
            # Check health of all services every 30 seconds
            health_status = await service_manager.check_all_services_health()
            
            # Log if overall status changed
            healthy_services = health_status["summary"]["healthy_services"]
            total_services = health_status["summary"]["total_services"]
            
            if healthy_services == total_services:
                logger.debug(f"Health check: All {total_services} services healthy")
            elif healthy_services > 0:
                logger.warning(f"Health check: {healthy_services}/{total_services} services healthy")
            else:
                logger.error(f"Health check: No services healthy ({total_services} failed)")
            
            await asyncio.sleep(30)
            
        except Exception as e:
            logger.error(f"Health monitoring loop error: {e}")
            await asyncio.sleep(60)  # Wait longer on error


# Create FastAPI app
app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description=settings.app_description,
    lifespan=lifespan,
)

# Include routers
app.include_router(crawler_router)
app.include_router(config_router)
app.include_router(fs_router)
from api.system import router as system_router
app.include_router(system_router)


@app.get("/")
async def root():
    """Root endpoint with API information"""
    return {
        "name": settings.app_name,
        "version": settings.app_version,
        "status": "running",
        "endpoints": {
            "docs": "/docs",
            "redoc": "/redoc",
            "health": "/health",
            "crawler": {
                "status": "/api/crawler/status",
                "start": "/api/crawler/start",
                "stop": "/api/crawler/stop",
                "clear_indexes": "/api/crawler/clear-indexes",
                "watch_paths": "/api/config/watch-paths",
                "batch_watch_paths": "/api/config/watch-paths/batch"
            },
            "configuration": "/api/config",
        },
        "features": {
            "parallel_discovery": "File discovery runs in parallel with indexing",
            "auto_resume": "Automatically resumes crawling if it was running before shutdown",
            "monitoring": "Real-time file change detection with operation queue",
            "job_management": "Simple start/stop/clear operations with progress tracking",
            "instant_startup": "FastAPI starts instantly, services initialize in background",
            "health_monitoring": "Real-time health monitoring of all system services"
        }
    }


@app.get("/health")
async def health_check():
    """Enhanced health check endpoint with service status"""
    from services.service_manager import get_service_manager
    
    try:
        service_manager = get_service_manager()
        health_status = await service_manager.check_all_services_health()
        
        # Determine HTTP status code based on overall health
        overall_status = health_status["overall_status"]
        status_code = 200
        if overall_status == "critical":
            status_code = 503
        elif overall_status == "degraded":
            status_code = 200  # Still functional but degraded
        
        return {
            "status": overall_status,
            "timestamp": int(time.time() * 1000),
            "services": health_status["services"],
            "summary": health_status["summary"],
            "details": {
                "database": "sqlite_connection",
                "search_engine": "typesense",
                "crawl_engine": "crawl_job_manager",
                "monitoring": "file_watcher"
            }
        }
        
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        return JSONResponse(
            status_code=503,
            content={
                "status": "unhealthy",
                "timestamp": int(time.time() * 1000),
                "error": str(e),
            },
        )


if __name__ == "__main__":
    import uvicorn
    import asyncio
    
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.debug,
        log_level="info",
    )