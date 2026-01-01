"""
Watch paths management API endpoints
"""
from typing import List
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session
import os

from database.models import get_db
from database.repositories import WatchPathRepository
from core.logging import logger
from api.models.crawler import (
    BatchWatchPathRequest,
    BatchWatchPathResponse,
    MessageResponse,
)

router = APIRouter(prefix="/config/watch-paths", tags=["configuration"])

class WatchPathResponse(BaseModel):
    id: int
    path: str
    enabled: bool
    include_subdirectories: bool
    created_at: str | None = None
    updated_at: str | None = None

class WatchPathUpdateRequest(BaseModel):
    enabled: bool | None = None
    include_subdirectories: bool | None = None

@router.get("", response_model=List[WatchPathResponse])
async def get_watch_paths(
    enabled_only: bool = False,
    db: Session = Depends(get_db),
):
    """
    Get all configured watch paths.

    - If enabled_only is true, return only enabled paths.
    """
    watch_path_repo = WatchPathRepository(db)
    if enabled_only:
        paths = watch_path_repo.get_enabled()
    else:
        paths = watch_path_repo.get_all()
        
    return [
        WatchPathResponse(
            id=p.id,
            path=p.path,
            enabled=p.enabled,
            include_subdirectories=p.include_subdirectories,
            created_at=p.created_at.isoformat() if p.created_at else None,
            updated_at=p.updated_at.isoformat() if p.updated_at else None,
        )
        for p in paths
    ]

@router.post("/batch", response_model=BatchWatchPathResponse)
async def add_watch_paths_batch(
    request: BatchWatchPathRequest,
    db: Session = Depends(get_db),
):
    """
    Append multiple watch paths.

    - Validates each path exists and is a directory.
    - Skips duplicates or invalid paths.
    """
    watch_path_repo = WatchPathRepository(db)
    added_paths: List[dict] = []
    skipped_paths: List[dict] = []

    for path in request.paths:
        if not os.path.exists(path):
            skipped_paths.append({"path": path, "reason": "Path does not exist"})
            continue
        if not os.path.isdir(path):
            skipped_paths.append({"path": path, "reason": "Path is not a directory"})
            continue
        try:
            watch_path = watch_path_repo.create_if_not_exists(
                path, include_subdirectories=request.include_subdirectories
            )
            added_paths.append(
                WatchPathResponse(
                    id=watch_path.id,
                    path=watch_path.path,
                    enabled=watch_path.enabled,
                    include_subdirectories=watch_path.include_subdirectories,
                    created_at=watch_path.created_at.isoformat() if watch_path.created_at else None,
                    updated_at=watch_path.updated_at.isoformat() if watch_path.updated_at else None,
                ).model_dump()
            )
            logger.info(f"Added watch path via batch API: {path}")
        except ValueError as e:
            skipped_paths.append({"path": path, "reason": str(e)})

    return BatchWatchPathResponse(
        added=added_paths,
        skipped=skipped_paths,
        total_added=len(added_paths),
        total_skipped=len(skipped_paths),
    )

@router.put("", response_model=MessageResponse)
async def replace_watch_paths(
    request: BatchWatchPathRequest,
    db: Session = Depends(get_db),
):
    """
    Replace all watch paths with the provided set.

    - Clears all existing watch paths.
    - Adds all valid provided paths.
    """
    watch_path_repo = WatchPathRepository(db)
    watch_path_repo.delete_all()

    added_count = 0
    for path in request.paths:
        if not os.path.exists(path) or not os.path.isdir(path):
            continue
        try:
            watch_path_repo.create_if_not_exists(path, include_subdirectories=True)
            added_count += 1
        except ValueError:
            # Skip duplicates or invalid entries
            continue

    logger.info(f"Replaced watch paths via batch API: {added_count} added")
 
    return MessageResponse(
        message=f"Replaced all watch paths. Added {added_count} path(s).",
        success=True,
        timestamp=None,
    )

@router.delete("", response_model=MessageResponse)
async def clear_watch_paths(
    db: Session = Depends(get_db),
):
    """
    Remove all configured watch paths.
    """
    watch_path_repo = WatchPathRepository(db)
    count = watch_path_repo.delete_all()

    logger.info(f"Cleared all watch paths via API: {count} removed")

    return MessageResponse(
        message=f"Removed all watch paths. Deleted {count} path(s).",
        success=True,
    )

@router.put("/{path_id}", response_model=WatchPathResponse)
async def update_watch_path_by_id(
    path_id: int,
    request: WatchPathUpdateRequest,
    db: Session = Depends(get_db),
):
    """
    Update a single watch path by its ID.
    """
    watch_path_repo = WatchPathRepository(db)
    
    update_data = request.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="No update data provided")
    
    watch_path = watch_path_repo.get(path_id)
    if not watch_path:
        raise HTTPException(status_code=404, detail="Watch path not found")

    updated_path = watch_path_repo.update(watch_path, update_data)

    logger.info(f"Updated watch path with ID {path_id} via API: {update_data}")

    return WatchPathResponse(
        id=updated_path.id,
        path=updated_path.path,
        enabled=updated_path.enabled,
        include_subdirectories=updated_path.include_subdirectories,
        created_at=updated_path.created_at.isoformat() if updated_path.created_at else None,
        updated_at=updated_path.updated_at.isoformat() if updated_path.updated_at else None,
    )

@router.delete("/{path_id}", response_model=MessageResponse)
async def delete_watch_path_by_id(
    path_id: int,
    db: Session = Depends(get_db),
):
    """
    Delete a single watch path by its ID.
    """
    watch_path_repo = WatchPathRepository(db)
    deleted_path = watch_path_repo.delete(path_id)

    if not deleted_path:
        raise HTTPException(status_code=404, detail="Watch path not found")

    logger.info(f"Deleted watch path with ID {path_id} via API")

    import time
    return MessageResponse(
        message=f"Watch path with ID {path_id} deleted.",
        success=True,
        timestamp=int(time.time() * 1000),
    )