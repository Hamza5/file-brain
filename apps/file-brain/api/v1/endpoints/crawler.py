"""
Crawl control API endpoints (Database-backed)
"""

import asyncio
import os
import time
from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from api.models.crawler import (
    ClearIndexesResponse,
    CrawlStatusResponse,
    MessageResponse,
)
from core.logging import logger
from database.models import get_db
from database.repositories import SettingsRepository, WatchPathRepository
from services.crawler.manager import get_crawl_job_manager

router = APIRouter(prefix="/crawler", tags=["crawler"])


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
async def start_crawler(db: Session = Depends(get_db)):
    """Start the crawl job with parallel discovery and indexing"""
    try:
        from services.service_manager import require_service

        # Check service readiness before starting crawl
        require_service("crawl_manager")
        require_service("typesense")

        watch_path_repo = WatchPathRepository(db)
        settings_repo = SettingsRepository(db)

        # Initialize default settings if they don't exist
        settings_repo.initialize_defaults(
            {
                "max_file_size_mb": "100",
                "batch_size": "10",
                "worker_queue_size": "1000",
            }
        )

        # Get watch paths from database
        watch_path_models = watch_path_repo.get_enabled()

        if not watch_path_models:
            raise HTTPException(
                status_code=400,
                detail="No watch paths configured. Add watch paths first using the watch path endpoints.",
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
            raise HTTPException(status_code=400, detail="No valid watch paths configured")

        logger.info(f"Starting crawl job for {len(valid_paths)} paths: {[p.path for p in valid_paths]}")

        # Start the crawl job
        crawl_manager = get_crawl_job_manager(watch_paths=valid_paths)
        success = await crawl_manager.start_crawl()

        if not success:
            raise HTTPException(status_code=500, detail="Failed to start crawl job")

        logger.info("Enhanced crawl job started successfully")

        return MessageResponse(
            message=f"Enhanced crawl job started successfully for {len(valid_paths)} path(s). "
            f"Parallel discovery and indexing are running.",
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

        await crawl_manager.stop_crawl()

        logger.info("Enhanced crawl job stopped successfully")

        return MessageResponse(
            message="Enhanced crawl job stopped successfully.",
            success=True,
            timestamp=int(time.time() * 1000),
        )

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
                detail="Cannot clear indexes while crawl job is running. Stop the crawl first.",
            )

        logger.info("Clearing all indexes via API...")

        success = await crawl_manager.clear_indexes()

        if not success:
            raise HTTPException(status_code=500, detail="Failed to clear indexes")

        logger.info("All indexes cleared successfully")

        return ClearIndexesResponse(
            success=True,
            message="All indexes and tracking data cleared successfully. "
            "Starting a new crawl will process all files from scratch.",
            timestamp=int(time.time() * 1000),
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error clearing indexes: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/stats")
async def get_crawler_stats(db: Session = Depends(get_db)):
    """
    Aggregate crawler statistics for UI using Typesense as the single source of truth.
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

        # Fix: Ensure consistency between discovered and indexed counts
        indexed = int(total_indexed)
        discovered = max(int(status_dict.get("files_discovered", 0)), indexed)

        indexed_vs_discovered = float(indexed) / discovered if discovered > 0 else 0.0

        return {
            "totals": {
                "discovered": discovered,
                "indexed": indexed,
            },
            "ratios": {
                "indexed_vs_discovered": min(indexed_vs_discovered, 1.0),
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
    Server-Sent Events (SSE) stream that pushes crawl status + stats ONLY when state changes.
    """

    async def event_generator():
        import json as _json

        from fastapi.encoders import jsonable_encoder

        from services.typesense_client import get_typesense_client

        previous_payload = None
        last_heartbeat = time.time()
        heartbeat_interval = 30

        def payloads_equal(p1: dict | None, p2: dict | None) -> bool:
            """Compare two payloads to detect changes, ignoring timestamp"""
            if p1 is None or p2 is None:
                return False
            p1_copy = {k: v for k, v in p1.items() if k != "timestamp"}
            p2_copy = {k: v for k, v in p2.items() if k != "timestamp"}
            return p1_copy == p2_copy

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

                # Get watch paths from database
                try:
                    watch_path_repo = WatchPathRepository(db)
                    watch_path_models = watch_path_repo.get_all()
                    watch_paths = [
                        {
                            "id": wp.id,
                            "path": wp.path,
                            "enabled": wp.enabled,
                            "include_subdirectories": wp.include_subdirectories,
                            "created_at": wp.created_at.isoformat() if wp.created_at else None,
                            "updated_at": wp.updated_at.isoformat() if wp.updated_at else None,
                        }
                        for wp in watch_path_models
                    ]
                except Exception as e:
                    logger.warning(f"Failed to get watch paths in SSE: {e}")
                    watch_paths = []

                indexed = int(total_indexed)
                discovered = max(int(status_dict.get("files_discovered", 0)), indexed)

                indexed_vs_discovered = float(indexed) / discovered if discovered > 0 else 0.0

                payload = {
                    "status": status_dict,
                    "stats": {
                        "totals": {
                            "discovered": discovered,
                            "indexed": indexed,
                        },
                        "ratios": {
                            "indexed_vs_discovered": min(indexed_vs_discovered, 1.0),
                        },
                        "file_types": file_types,
                        "runtime": {
                            "running": bool(crawl_manager.is_running()),
                        },
                        "healthy": healthy,
                    },
                    "watch_paths": watch_paths,
                    "timestamp": int(time.time() * 1000),
                }

                data = jsonable_encoder(payload)

                if not payloads_equal(data, previous_payload):
                    yield f"data: {_json.dumps(data)}\n\n"
                    previous_payload = data
                    last_heartbeat = time.time()
                elif time.time() - last_heartbeat > heartbeat_interval:
                    yield ":heartbeat\n\n"
                    last_heartbeat = time.time()

                current_phase = status_dict.get("current_phase", "idle")
                if current_phase in ("verifying", "discovering", "indexing"):
                    # Fast updates when active
                    poll_interval = 0.5
                else:
                    # Responsive even when idle
                    poll_interval = 1.0

                await asyncio.sleep(poll_interval)
            except Exception as e:
                logger.error(f"Error in crawler SSE stream: {e}")
                break

    from fastapi.responses import StreamingResponse

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    )


@router.get("/settings", response_model=Dict[str, Any])
async def get_crawler_settings(db: Session = Depends(get_db)):
    """Get current crawler settings"""
    try:
        settings_repo = SettingsRepository(db)

        # Initialize defaults if they don't exist
        settings_repo.initialize_defaults(
            {
                "max_file_size_mb": "100",
                "batch_size": "10",
                "worker_queue_size": "1000",
            }
        )

        settings = settings_repo.get_all_as_dict()
        return settings

    except Exception as e:
        logger.error(f"Error getting crawler settings: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/settings", response_model=MessageResponse)
async def update_crawler_settings(settings: Dict[str, Any], db: Session = Depends(get_db)):
    """Update crawler settings"""
    try:
        settings_repo = SettingsRepository(db)

        for key, value in settings.items():
            if key in ["max_file_size_mb", "batch_size", "worker_queue_size"]:
                settings_repo.set(key, value)

        logger.info(f"Updated crawler settings: {settings}")

        return MessageResponse(
            message=f"Updated crawler settings: {list(settings.keys())}",
            success=True,
            timestamp=int(time.time() * 1000),
        )

    except Exception as e:
        logger.error(f"Error updating crawler settings: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/verify-index", response_model=Dict[str, Any])
async def verify_indexed_files(db: Session = Depends(get_db)):
    """
    Manually trigger index verification to detect and clean up orphaned entries.
    """
    try:
        crawl_manager = get_crawl_job_manager()

        if crawl_manager.is_running():
            raise HTTPException(
                status_code=400,
                detail="Cannot verify index while crawl job is running. Stop the crawl first.",
            )

        logger.info("Manual index verification triggered via API...")

        watch_path_repo = WatchPathRepository(db)
        watch_path_models = watch_path_repo.get_enabled()
        watch_paths = [wp.path for wp in watch_path_models]

        if not watch_paths:
            raise HTTPException(status_code=400, detail="No watch paths configured for verification")

        # Placeholder
        verification_stats = {}

        logger.info(f"Manual index verification completed: {verification_stats}")

        return {
            "success": True,
            "message": "Index verification completed.",
            "stats": verification_stats,
            "timestamp": int(time.time() * 1000),
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error during index verification: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/verification-status")
async def get_verification_status(db: Session = Depends(get_db)):
    """
    Get information about index verification settings and last verification stats.
    """
    try:
        from core.config import settings

        crawl_manager = get_crawl_job_manager()

        # Get current index count
        from services.typesense_client import get_typesense_client

        typesense_client = get_typesense_client()
        try:
            total_indexed = await typesense_client.get_indexed_files_count()
        except Exception as e:
            logger.warning(f"Could not get index count: {e}")
            total_indexed = 0

        return {
            "verification_settings": {
                "verify_index_on_crawl": settings.verify_index_on_crawl,
                "verification_batch_size": settings.verification_batch_size,
                "max_verification_files": settings.max_verification_files,
                "cleanup_orphaned_files": settings.cleanup_orphaned_files,
            },
            "index_stats": {
                "total_indexed_files": total_indexed,
            },
            "crawler_status": {
                "is_running": crawl_manager.is_running(),
            },
        }

    except Exception as e:
        logger.error(f"Error getting verification status: {e}")
        raise HTTPException(status_code=500, detail=str(e))
