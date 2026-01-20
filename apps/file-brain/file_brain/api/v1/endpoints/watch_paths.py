"""
Watch paths management API endpoints
"""

import os
import time
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from file_brain.api.models.crawler import (
    MessageResponse,
    WatchPathCreateRequest,
)
from file_brain.core.logging import logger
from file_brain.database.models import get_db
from file_brain.database.repositories import WatchPathRepository

router = APIRouter(prefix="/config/watch-paths", tags=["configuration"])


class WatchPathResponse(BaseModel):
    id: int
    path: str
    enabled: bool
    include_subdirectories: bool
    is_excluded: bool
    created_at: str | None = None
    updated_at: str | None = None


class WatchPathUpdateRequest(BaseModel):
    enabled: bool | None = None
    include_subdirectories: bool | None = None
    is_excluded: bool | None = None


@router.get("", response_model=List[WatchPathResponse])
def get_watch_paths(
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
            is_excluded=p.is_excluded,
            created_at=p.created_at.isoformat() if p.created_at else None,
            updated_at=p.updated_at.isoformat() if p.updated_at else None,
        )
        for p in paths
    ]


@router.post("", response_model=WatchPathResponse)
def create_watch_path(
    request: WatchPathCreateRequest,
    db: Session = Depends(get_db),
):
    """
    Add a single watch path.
    """
    from file_brain.core.telemetry import telemetry

    watch_path_repo = WatchPathRepository(db)

    if not os.path.exists(request.path):
        raise HTTPException(status_code=400, detail=f"Path not found: {request.path}")
    if not os.path.isdir(request.path):
        raise HTTPException(status_code=400, detail=f"Path is not a directory: {request.path}")

    try:
        watch_path = watch_path_repo.create_if_not_exists(
            request.path,
            include_subdirectories=request.include_subdirectories,
            is_excluded=request.is_excluded,
        )

        # Ensure enabled state matches request (create_if_not_exists might return existing disabled one)
        if watch_path.enabled != request.enabled:
            watch_path = watch_path_repo.update(watch_path.id, {"enabled": request.enabled})

        logger.info(f"Added watch path: {request.path}")

        # Track watch path addition
        telemetry.capture_event(
            "watch_path_added",
            {
                "include_subdirectories": request.include_subdirectories,
                "is_excluded": request.is_excluded,
            },
        )

        return WatchPathResponse(
            id=watch_path.id,
            path=watch_path.path,
            enabled=watch_path.enabled,
            include_subdirectories=watch_path.include_subdirectories,
            is_excluded=watch_path.is_excluded,
            created_at=watch_path.created_at.isoformat() if watch_path.created_at else None,
            updated_at=watch_path.updated_at.isoformat() if watch_path.updated_at else None,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("", response_model=MessageResponse)
def clear_watch_paths(
    db: Session = Depends(get_db),
):
    """
    Remove all configured watch paths.
    """
    from file_brain.core.telemetry import telemetry

    watch_path_repo = WatchPathRepository(db)
    count = watch_path_repo.delete_all()

    logger.info(f"Cleared all watch paths via API: {count} removed")

    # Track watch paths clear
    if count > 0:
        telemetry.capture_event("watch_paths_cleared", {"count": count})

    return MessageResponse(
        message=f"Removed all watch paths. Deleted {count} path(s).",
        success=True,
        timestamp=int(time.time() * 1000),
    )


@router.put("/{path_id}", response_model=WatchPathResponse)
def update_watch_path_by_id(
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
        is_excluded=updated_path.is_excluded,
        created_at=updated_path.created_at.isoformat() if updated_path.created_at else None,
        updated_at=updated_path.updated_at.isoformat() if updated_path.updated_at else None,
    )


@router.delete("/{path_id}", response_model=MessageResponse)
def delete_watch_path_by_id(
    path_id: int,
    db: Session = Depends(get_db),
):
    """
    Delete a single watch path by its ID.
    """
    from file_brain.core.telemetry import telemetry

    watch_path_repo = WatchPathRepository(db)
    deleted_path = watch_path_repo.delete(path_id)

    if not deleted_path:
        raise HTTPException(status_code=404, detail="Watch path not found")

    logger.info(f"Deleted watch path with ID {path_id} via API")

    # Track watch path removal
    telemetry.capture_event("watch_path_removed")

    import time

    return MessageResponse(
        message=f"Watch path with ID {path_id} deleted.",
        success=True,
        timestamp=int(time.time() * 1000),
    )
