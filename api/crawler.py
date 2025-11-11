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
        watch_paths = db_service.get_watch_paths(enabled_only=True)
        
        if not watch_paths:
            raise HTTPException(
                status_code=400,
                detail="No watch paths configured. Add watch paths first using the watch path endpoints."
            )
        
        # Validate watch paths
        valid_paths = []
        for path in watch_paths:
            if not os.path.exists(path):
                logger.warning(f"Watch path does not exist: {path}")
                continue
            if not os.path.isdir(path):
                logger.warning(f"Watch path is not a directory: {path}")
                continue
            valid_paths.append(path)
        
        if not valid_paths:
            raise HTTPException(
                status_code=400,
                detail="No valid watch paths configured"
            )
        
        # Get settings from database
        settings = db_service.get_crawler_settings()
        start_monitoring = settings["start_monitoring"]
        include_subdirectories = settings["include_subdirectories"]
        
        logger.info(f"Starting crawl job for {len(valid_paths)} paths: {valid_paths}")
        logger.info(f"File monitoring: {'enabled' if start_monitoring else 'disabled'}")
        logger.info(f"Include subdirectories: {include_subdirectories}")
        
        # Start the crawl job
        success = await crawl_manager.start_crawl(
            watch_paths=valid_paths,
            start_monitoring=start_monitoring,
            include_subdirectories=include_subdirectories
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
    """Get current crawl status and progress"""
    try:
        crawl_manager = get_crawl_job_manager()
        status_dict = crawl_manager.get_status()
        
        return CrawlStatusResponse(
            status=status_dict,
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
    Aggregate crawler statistics for UI (totals, ratios, simple time buckets).

    This is intentionally lightweight and based on current CrawlerState plus cheap
    derived values. It can be extended later with richer historical data.
    """
    try:
        db_service = DatabaseService(db)
        state = db_service.get_crawler_state()

        discovered = (state.files_discovered or 0)
        indexed = (state.files_indexed or 0)
        skipped = (state.files_skipped or 0) if hasattr(state, "files_skipped") else 0
        failed = (state.files_error or 0)
        deleted = (state.files_deleted or 0)

        # bytes indexed: optional field, default 0 when missing
        indexed_bytes = getattr(state, "indexed_bytes", 0) or 0

        # Ratios
        indexed_vs_discovered = float(indexed) / discovered if discovered > 0 else 0.0
        total_attempted = indexed + failed
        success_rate = float(indexed) / total_attempted if total_attempted > 0 else 0.0

        # Runtime metadata: last known start/completion from state
        last_crawl_started_at = (
            int(state.crawl_job_started_at.timestamp() * 1000)
            if getattr(state, "crawl_job_started_at", None)
            else None
        )
        last_crawl_completed_at = (
            int(state.last_completion_at.timestamp() * 1000)
            if hasattr(state, "last_completion_at") and state.last_completion_at
            else None
        )

        # Simple time-series placeholders (can be enriched later).
        # For now, return empty arrays so frontend Recharts have a stable shape.
        indexed_per_hour = []
        indexed_per_day = []

        # Current running flag derived from state and manager
        crawl_manager = get_crawl_job_manager()
        running = bool(crawl_manager.is_running())

        return {
            "totals": {
                "discovered": discovered,
                "indexed": indexed,
                "skipped": skipped,
                "failed": failed,
                "deleted": deleted,
                "indexed_bytes": indexed_bytes,
            },
            "ratios": {
                "indexed_vs_discovered": indexed_vs_discovered,
                "success_rate": success_rate,
            },
            "timeseries": {
                "indexed_per_hour": indexed_per_hour,
                "indexed_per_day": indexed_per_day,
            },
            "runtime": {
                "last_crawl_started_at": last_crawl_started_at,
                "last_crawl_completed_at": last_crawl_completed_at,
                "running": running,
            },
        }
    except Exception as e:
        logger.error(f"Error getting crawler stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/stream")
async def stream_crawler_status(db: Session = Depends(get_db)):
    """
    Server-Sent Events (SSE) stream that pushes crawl status + stats.

    - Emits a JSON payload compatible with frontend StreamPayload:
      { "status": { ... }, "stats": { ... }, "timestamp": ms }
    - Designed to be lightweight; uses existing get_status() and /stats-style aggregation.
    """

    async def event_generator():
        from fastapi.encoders import jsonable_encoder

        while True:
            try:
                crawl_manager = get_crawl_job_manager()
                status_dict = crawl_manager.get_status()

                # Load stats via the same logic as get_crawler_stats()
                db_service_local = DatabaseService(db)
                state = db_service_local.get_crawler_state()

                discovered = (state.files_discovered or 0)
                indexed = (state.files_indexed or 0)
                skipped = (state.files_skipped or 0) if hasattr(state, "files_skipped") else 0
                failed = (state.files_error or 0)
                deleted = (state.files_deleted or 0)
                indexed_bytes = getattr(state, "indexed_bytes", 0) or 0

                indexed_vs_discovered = float(indexed) / discovered if discovered > 0 else 0.0
                total_attempted = indexed + failed
                success_rate = float(indexed) / total_attempted if total_attempted > 0 else 0.0

                last_crawl_started_at = (
                    int(state.crawl_job_started_at.timestamp() * 1000)
                    if getattr(state, "crawl_job_started_at", None)
                    else None
                )
                last_crawl_completed_at = (
                    int(state.last_completion_at.timestamp() * 1000)
                    if hasattr(state, "last_completion_at") and state.last_completion_at
                    else None
                )

                payload = {
                    "status": status_dict,
                    "stats": {
                        "totals": {
                            "discovered": discovered,
                            "indexed": indexed,
                            "skipped": skipped,
                            "failed": failed,
                            "deleted": deleted,
                            "indexed_bytes": indexed_bytes,
                        },
                        "ratios": {
                            "indexed_vs_discovered": indexed_vs_discovered,
                            "success_rate": success_rate,
                        },
                        "timeseries": {
                            "indexed_per_hour": [],
                            "indexed_per_day": [],
                        },
                        "runtime": {
                            "last_crawl_started_at": last_crawl_started_at,
                            "last_crawl_completed_at": last_crawl_completed_at,
                            "running": bool(crawl_manager.is_running()),
                        },
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
            if key in ["start_monitoring", "include_subdirectories"]:
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

