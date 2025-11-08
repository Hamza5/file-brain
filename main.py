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
from utils.logger import logger


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application lifespan manager
    Handles startup and shutdown events
    """
    # Startup
    logger.info("=" * 50)
    logger.info(f"Starting {settings.app_name} v{settings.app_version}")
    logger.info("=" * 50)
    
    try:
        # Initialize database
        logger.info("Initializing database...")
        init_db()
        db = SessionLocal()
        init_default_data(db)
        db.close()
        logger.info("✅ Database initialized")
        
        # Initialize Typesense collection
        logger.info("Initializing Typesense collection...")
        typesense = get_typesense_client()
        await typesense.initialize_collection()
        logger.info("✅ Typesense initialized")
        
        # Initialize crawl manager
        logger.info("Initializing  crawl manager...")
        crawl_manager = get_crawl_job_manager()
        logger.info("✅ Crawl manager initialized")
        
        # Get configuration from database
        db = SessionLocal()
        db_service = DatabaseService(db)
        watch_paths = db_service.get_watch_paths(enabled_only=True)
        
        # Check if crawling was running before shutdown
        previous_state = db_service.get_crawler_state()
        was_running_before = previous_state.crawl_job_running
        
        if was_running_before:
            logger.info(f"🔄 Resuming previous crawl job (type: {previous_state.crawl_job_type})")
            logger.info(f"📁 Watch paths: {watch_paths}")
            
            # Resume the crawl job with the same configuration
            success = await crawl_manager.start_crawl(
                watch_paths,
                start_monitoring="monitor" in previous_state.crawl_job_type
            )
            
            if success:
                logger.info("✅ Crawl job resumed successfully")
                logger.info("🔄 Parallel discovery and indexing active")
                if "monitor" in previous_state.crawl_job_type:
                    logger.info("👁️  File monitoring active")
            else:
                logger.warning("⚠️  Failed to resume crawl job")
        elif watch_paths:
            logger.info("📁 Watch paths configured but not auto-starting (was not running before)")
            logger.info("💡 Use /api/crawler/start to manually start crawling")
        else:
            logger.warning("⚠️  No watch paths configured. Add paths via /api/config/watch-paths and /api/config/watch-paths/batch")
        
        db.close()
        
        logger.info("=" * 50)
        logger.info("🚀 Application startup complete!")
        logger.info(f"📁 Watch paths: {watch_paths if watch_paths else 'None (configure via API)'}")
        logger.info(f"🔍 Search engine: {settings.typesense_url}")
        logger.info(f"⚙️  Configuration API: /api/config")
        logger.info("=" * 50)
        
    except Exception as e:
        logger.error(f"❌ Startup failed: {e}")
        raise
    
    yield
    
    # Shutdown
    logger.info("=" * 50)
    logger.info("Shutting down...")
    logger.info("=" * 50)
    
    try:
        # Stop crawl manager
        logger.info("Stopping  crawl manager...")
        crawl_manager = get_crawl_job_manager()
        if crawl_manager.is_running():
            await crawl_manager.stop_crawl()
            logger.info("✅ Crawl manager stopped")
        
    except Exception as e:
        logger.error(f"Error during shutdown: {e}")
    
    logger.info("=" * 50)
    logger.info("👋 Application shutdown complete")
    logger.info("=" * 50)


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
            "job_management": "Simple start/stop/clear operations with progress tracking"
        }
    }


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    try:
        # Check Typesense connection
        typesense = get_typesense_client()
        await typesense.get_collectionstats()
        
        # Get crawl manager status
        crawl_manager = get_crawl_job_manager()
        status = crawl_manager.get_status()
        
        return {
            "status": "healthy",
            "timestamp": int(time.time() * 1000),
            "components": {
                "typesense": "connected",
                "crawler": "running" if status["running"] else "stopped",
            },
            "stats": status,
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