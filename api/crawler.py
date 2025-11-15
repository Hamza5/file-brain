"""
Crawl control API endpoints (Database-backed)
All original crawler requirements replaced with improved functionality
"""
import asyncio
import time
import os
from datetime import datetime
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Dict, Any
from sqlalchemy.orm import Session

from database.models import get_db
from services.database_service import DatabaseService
from services.crawl_job_manager import get_crawl_job_manager
from api.models.crawler import (
    CrawlStatusResponse,
    BatchWatchPathRequest,
    BatchWatchPathResponse,
    ClearIndexesResponse,
    MessageResponse
)
from utils.logger import logger

router = APIRouter(prefix="/api/crawler", tags=["crawler"])


class WatchPathRequest(BaseModel):
    path: str


class WatchPathResponse(BaseModel):
    id: int
    path: str
    enabled: bool
    include_subdirectories: bool
    created_at: str | None = None
    updated_at: str | None = None


@router.post("/start", response_model=MessageResponse)
async def start_crawler(
    db: Session = Depends(get_db)
):
    """Start the crawl job with parallel discovery and indexing

    All configuration (watch paths, monitoring settings) should be stored in the database
    prior to calling this endpoint. Use the watch path endpoints to manage paths.
    """
    try:
        from services.service_manager import get_service_manager, require_service
        
        # Check service readiness before starting crawl
        require_service("crawl_manager")  # Will raise HTTPException if not ready
        require_service("typesense")     # Will raise HTTPException if not ready
        
        crawl_manager = get_crawl_job_manager()
        
        # Check if already running
        if crawl_manager.is_running():
            raise HTTPException(
                status_code=400,
                detail="Crawl job is already running"
            )
        
        # Get configuration from database
        db_service = DatabaseService(db)
        
        # Initialize default settings if they don't exist
        db_service.initialize_default_crawler_settings()
        
        # Get watch paths from database
        watch_path_models = db_service.list_watch_paths(enabled_only=True)
        
        if not watch_path_models:
            raise HTTPException(
                status_code=400,
                detail="No watch paths configured. Add watch paths first using the watch path endpoints."
            )
        
        # Validate watch paths
        valid_paths = []
        for path_model in watch_path_models:
            if not os.path.exists(path_model.path):
                logger.warning(f"Watch path does not exist: {path_model.path}")
                continue
            if not os.path.isdir(path_model.path):
                logger.warning(f"Watch path is not a directory: {path_model.path}")
                continue
            valid_paths.append(path_model)
        
        if not valid_paths:
            raise HTTPException(
                status_code=400,
                detail="No valid watch paths configured"
            )
        
        # Get settings from database
        settings = db_service.get_crawler_settings()
        start_monitoring = settings["start_monitoring"]
        
        logger.info(f"Starting crawl job for {len(valid_paths)} paths: {[p.path for p in valid_paths]}")
        logger.info(f"File monitoring: {'enabled' if start_monitoring else 'disabled'}")
        
        # Start the crawl job
        success = await crawl_manager.start_crawl(
            watch_paths=valid_paths,
            start_monitoring=start_monitoring,
        )
        
        if not success:
            raise HTTPException(
                status_code=500,
                detail="Failed to start crawl job"
            )
        
        logger.info("Enhanced crawl job started successfully")
        
        return MessageResponse(
            message=f"Enhanced crawl job started successfully for {len(valid_paths)} path(s). "
                   f"Parallel discovery, indexing, and file monitoring {'are' if start_monitoring else 'are not'} running.",
            success=True,
            timestamp=int(time.time() * 1000),
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error starting crawl job: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/status", response_model=CrawlStatusResponse)
async def get_crawler_status(db: Session = Depends(get_db)):
    """Get current crawl status and progress with service initialization info"""
    try:
        from services.service_manager import get_service_manager
        
        service_manager = get_service_manager()
        crawl_manager = get_crawl_job_manager()
        
        # Get crawl manager status
        status_dict = crawl_manager.get_status()
        
        # Get service initialization status
        services_health = await service_manager.check_all_services_health()
        
        # Create enhanced status with service info
        enhanced_status = status_dict.copy()
        enhanced_status["services"] = services_health["services"]
        enhanced_status["system_health"] = services_health["overall_status"]
        
        # Check if critical services are ready for crawl operations
        typesense_ready = service_manager.is_service_ready("typesense")
        crawl_manager_ready = service_manager.is_service_ready("crawl_manager")
        
        enhanced_status["crawl_available"] = typesense_ready and crawl_manager_ready
        enhanced_status["degraded_mode"] = not typesense_ready
        
        return CrawlStatusResponse(
            status=enhanced_status,
            timestamp=int(time.time() * 1000),
        )
        
    except Exception as e:
        logger.error(f"Error getting crawl status: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/stop", response_model=MessageResponse)
async def stop_crawler(db: Session = Depends(get_db)):
    """Stop the current crawl job immediately"""
    try:
        crawl_manager = get_crawl_job_manager()
        
        if not crawl_manager.is_running():
            return MessageResponse(
                message="No crawl job is currently running",
                success=True,
                timestamp=int(time.time() * 1000),
            )
        
        logger.info("Stopping crawl job via API...")
        
        success = await crawl_manager.stop_crawl()
        
        if not success:
            raise HTTPException(
                status_code=500,
                detail="Failed to stop crawl job"
            )
        
        logger.info("Enhanced crawl job stopped successfully")
        
        return MessageResponse(
            message="Enhanced crawl job stopped successfully. "
                   "File monitoring has also been stopped.",
            success=True,
            timestamp=int(time.time() * 1000),
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error stopping crawl job: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/clear-indexes", response_model=ClearIndexesResponse)
async def clear_all_indexes(db: Session = Depends(get_db)):
    """Clear all files from Typesense and reset indexed files tracking"""
    try:
        crawl_manager = get_crawl_job_manager()
        
        # Don't allow clearing while crawl is running
        if crawl_manager.is_running():
            raise HTTPException(
                status_code=400,
                detail="Cannot clear indexes while crawl job is running. Stop the crawl first."
            )
        
        logger.info("Clearing all indexes via API...")
        
        success = await crawl_manager.clear_indexes()
        
        if not success:
            raise HTTPException(
                status_code=500,
                detail="Failed to clear indexes"
            )
        
        logger.info("All indexes cleared successfully")
        
        return ClearIndexesResponse(
            success=True,
            message="All indexes and tracking data cleared successfully. "
                   "Starting a new crawl will process all files from scratch (no resume capability until indexing is complete).",
            timestamp=int(time.time() * 1000),
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error clearing indexes: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# Note:
# Watch path management is now exclusively handled by the configuration API
# under /api/config/watch-paths* using batch semantics.


# --- Stats & Streaming endpoints for UI ---

@router.get("/stats")
async def get_crawler_stats(db: Session = Depends(get_db)):
    """
    Aggregate crawler statistics for UI using Typesense as the single source of truth.
    
    Typesense provides:
    - num_documents: total indexed files
    - file_type_distribution: breakdown by file_extension
    
    CrawlJobManager provides:
    - running: current crawl status
    """
    try:
        from services.typesense_client import get_typesense_client
        
        typesense_client = get_typesense_client()
        crawl_manager = get_crawl_job_manager()
        
        # Get stats from Typesense
        try:
            ts_stats = await typesense_client.get_collection_stats()
            total_indexed = ts_stats.get("num_documents", 0)
            healthy = True
        except Exception as e:
            logger.warning(f"Typesense unavailable for stats: {e}")
            total_indexed = 0
            healthy = False
        
        # Get file type distribution from Typesense
        try:
            file_types = await typesense_client.get_file_type_distribution()
        except Exception as e:
            logger.warning(f"Failed to get file type distribution: {e}")
            file_types = {}
        
        # Runtime state from CrawlJobManager
        status_dict = crawl_manager.get_status()
        running = bool(status_dict.get("running", False))

        # Discovered comes from live runtime status (discovery_progress metrics),
        # not from Typesense. This reflects how many files we've seen so far.
        discovered = int(status_dict.get("files_discovered", 0))

        # Indexed comes from Typesense and is the single source of truth for indexed docs.
        indexed = int(total_indexed)

        # Ratios
        indexed_vs_discovered = (
            float(indexed) / discovered if discovered > 0 else 0.0
        )

        return {
            "totals": {
                "discovered": discovered,
                "indexed": indexed,
            },
            "ratios": {
                "indexed_vs_discovered": indexed_vs_discovered,
            },
            "file_types": file_types,
            "runtime": {
                "running": running,
            },
            "healthy": healthy,
        }
    except Exception as e:
        logger.error(f"Error getting crawler stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/stream")
async def stream_crawler_status(db: Session = Depends(get_db)):
    """
    Server-Sent Events (SSE) stream that pushes crawl status + stats using Typesense as source of truth.

    - Emits a JSON payload compatible with frontend StreamPayload:
      { "status": { ... }, "stats": { ... }, "timestamp": ms }
    - Stats are derived from Typesense (num_documents, file_types) + CrawlJobManager (running flag).
    """

    async def event_generator():
        from fastapi.encoders import jsonable_encoder
        from services.typesense_client import get_typesense_client

        while True:
            try:
                crawl_manager = get_crawl_job_manager()
                status_dict = crawl_manager.get_status()
                typesense_client = get_typesense_client()

                # Get stats from Typesense
                try:
                    ts_stats = await typesense_client.get_collection_stats()
                    total_indexed = ts_stats.get("num_documents", 0)
                    healthy = True
                except Exception as e:
                    logger.warning(f"Typesense unavailable in SSE stream: {e}")
                    total_indexed = 0
                    healthy = False
                
                # Get file type distribution from Typesense
                try:
                    file_types = await typesense_client.get_file_type_distribution()
                except Exception as e:
                    logger.warning(f"Failed to get file type distribution in SSE: {e}")
                    file_types = {}
                
                # Discovered from runtime status, Indexed from Typesense.
                discovered = int(status_dict.get("files_discovered", 0))
                indexed = int(total_indexed)
                indexed_vs_discovered = (
                    float(indexed) / discovered if discovered > 0 else 0.0
                )

                payload = {
                    "status": status_dict,
                    "stats": {
                        "totals": {
                            "discovered": discovered,
                            "indexed": indexed,
                        },
                        "ratios": {
                            "indexed_vs_discovered": indexed_vs_discovered,
                        },
                        "file_types": file_types,
                        "runtime": {
                            "running": bool(crawl_manager.is_running()),
                        },
                        "healthy": healthy,
                    },
                    "timestamp": int(time.time() * 1000),
                }

                # Ensure strict JSON in SSE payload (no Python literals)
                data = jsonable_encoder(payload)
                import json as _json

                yield f"data: {_json.dumps(data)}\n\n"

                # Dynamic interval: faster when running, slower when idle.
                await asyncio.sleep(1.0 if status_dict.get("running") else 5.0)
            except Exception as e:
                logger.error(f"Error in crawler SSE stream: {e}")
                break

    from fastapi import Response
    from fastapi.responses import StreamingResponse

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    )


# Crawler Settings Management

@router.get("/settings", response_model=Dict[str, Any])
async def get_crawler_settings(db: Session = Depends(get_db)):
    """Get current crawler settings"""
    try:
        db_service = DatabaseService(db)
        
        # Initialize defaults if they don't exist
        db_service.initialize_default_crawler_settings()
        
        settings = db_service.get_crawler_settings()
        return settings
        
    except Exception as e:
        logger.error(f"Error getting crawler settings: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/settings", response_model=MessageResponse)
async def update_crawler_settings(
    settings: Dict[str, Any],
    db: Session = Depends(get_db)
):
    """Update crawler settings"""
    try:
        db_service = DatabaseService(db)
        
        # Update each setting
        for key, value in settings.items():
            if key in ["start_monitoring"]:
                db_service.set_crawler_setting(key, value)
        
        logger.info(f"Updated crawler settings: {settings}")
        
        return MessageResponse(
            message=f"Updated crawler settings: {list(settings.keys())}",
            success=True,
            timestamp=int(time.time() * 1000),
        )
        
    except Exception as e:
        logger.error(f"Error updating crawler settings: {e}")
        raise HTTPException(status_code=500, detail=str(e))

