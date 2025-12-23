"""
Configuration management API endpoints
"""
from typing import List
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database.models import WatchPath, get_db
from services.database_service import DatabaseService
from utils.logger import logger
from api.models.crawler import (
    BatchWatchPathRequest,
    BatchWatchPathResponse,
    MessageResponse,
)

router = APIRouter(prefix="/api/config", tags=["configuration"])


# Request/Response Models

class WatchPathResponse(BaseModel):
    id: int
    path: str
    enabled: bool
    include_subdirectories: bool
    created_at: str | None = None
    updated_at: str | None = None


class SettingRequest(BaseModel):
    key: str
    value: str
    description: str | None = None


class SettingResponse(BaseModel):
    key: str
    value: str
    description: str | None = None


class ToggleRequest(BaseModel):
    enabled: bool


class ToggleRequest(BaseModel):
    enabled: bool


class WatchPathUpdateRequest(BaseModel):
    enabled: bool | None = None
    include_subdirectories: bool | None = None


class ConfigurationResponse(BaseModel):
    watch_paths: List[WatchPathResponse]
    settings: dict


# Watch Paths Endpoints (batch-only, canonical)

@router.get("/watch-paths", response_model=List[WatchPathResponse])
async def get_watch_paths(
    enabled_only: bool = False,
    db: Session = Depends(get_db),
):
    """
    Get all configured watch paths.

    - If enabled_only is true, return only enabled paths.
    """
    query = db.query(WatchPath)
    if enabled_only:
        query = query.filter(WatchPath.enabled == True)

    paths = query.all()
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


# BatchWatchPathRequest, BatchWatchPathResponse, and MessageResponse
# are imported from api.models.crawler to keep models centralized.


@router.post("/watch-paths/batch", response_model=BatchWatchPathResponse)
async def add_watch_paths_batch(
    request: BatchWatchPathRequest,
    db: Session = Depends(get_db),
):
    """
    Append multiple watch paths.

    - Validates each path exists and is a directory.
    - Skips duplicates or invalid paths.
    """
    import os

    db_service = DatabaseService(db)
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
            watch_path = db_service.add_watch_path(
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


@router.put("/watch-paths", response_model=MessageResponse)
async def replace_watch_paths(
    request: BatchWatchPathRequest,
    db: Session = Depends(get_db),
):
    """
    Replace all watch paths with the provided set.

    - Clears all existing watch paths.
    - Adds all valid provided paths.
    """
    import os

    db_service = DatabaseService(db)
    db_service.remove_all_watch_paths()

    added_count = 0
    for path in request.paths:
        if not os.path.exists(path) or not os.path.isdir(path):
            continue
        try:
            # include_subdirectories is not part of this batch request, so it defaults to True
            db_service.add_watch_path(path, include_subdirectories=True)
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


@router.delete("/watch-paths", response_model=MessageResponse)
async def clear_watch_paths(
    db: Session = Depends(get_db),
):
    """
    Remove all configured watch paths.
    """
    db_service = DatabaseService(db)
    count = db_service.remove_all_watch_paths()

    logger.info(f"Cleared all watch paths via API: {count} removed")

    return MessageResponse(
        message=f"Removed all watch paths. Deleted {count} path(s).",
        success=True,
    )


@router.put("/watch-paths/{path_id}", response_model=WatchPathResponse)
async def update_watch_path_by_id(
    path_id: int,
    request: WatchPathUpdateRequest,
    db: Session = Depends(get_db),
):
    """
    Update a single watch path by its ID.
    """
    db_service = DatabaseService(db)
    
    update_data = request.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="No update data provided")

    updated_path = db_service.update_watch_path(path_id, **update_data)

    if not updated_path:
        raise HTTPException(status_code=404, detail="Watch path not found")

    logger.info(f"Updated watch path with ID {path_id} via API: {update_data}")

    return WatchPathResponse(
        id=updated_path.id,
        path=updated_path.path,
        enabled=updated_path.enabled,
        include_subdirectories=updated_path.include_subdirectories,
        created_at=updated_path.created_at.isoformat() if updated_path.created_at else None,
        updated_at=updated_path.updated_at.isoformat() if updated_path.updated_at else None,
    )


@router.delete("/watch-paths/{path_id}", response_model=MessageResponse)
async def delete_watch_path_by_id(
    path_id: int,
    db: Session = Depends(get_db),
):
    """
    Delete a single watch path by its ID.
    """
    db_service = DatabaseService(db)
    success = db_service.delete_watch_path(path_id)

    if not success:
        raise HTTPException(status_code=404, detail="Watch path not found")

    logger.info(f"Deleted watch path with ID {path_id} via API")

    import time
    return MessageResponse(
        message=f"Watch path with ID {path_id} deleted.",
        success=True,
        timestamp=int(time.time() * 1000),
    )


# Settings Endpoints

@router.get("/settings")
async def get_all_settings(db: Session = Depends(get_db)):
    """Get all settings"""
    from database.models import Setting
    
    settings = db.query(Setting).all()
    return {
        s.key: {
            "value": s.value,
            "description": s.description
        }
        for s in settings
    }


@router.get("/settings/{key}")
async def get_setting(
    key: str,
    db: Session = Depends(get_db)
):
    """Get a specific setting"""
    db_service = DatabaseService(db)
    value = db_service.get_setting(key)
    
    if value is None:
        raise HTTPException(status_code=404, detail="Setting not found")
    
    return {"key": key, "value": value}


@router.put("/settings/{key}")
async def update_setting(
    key: str,
    value: str,
    description: str | None = None,
    db: Session = Depends(get_db)
):
    """Update a setting"""
    db_service = DatabaseService(db)
    setting = db_service.set_setting(key, value, description)
    
    logger.info(f"Updated setting via API: {key}={value}")
    
    return SettingResponse(
        key=setting.key,
        value=setting.value,
        description=setting.description
    )


@router.get("/", response_model=ConfigurationResponse)
async def get_full_configuration(db: Session = Depends(get_db)):
    """Get complete configuration"""
    from database.models import WatchPath, Setting
    
    watch_paths = db.query(WatchPath).all()
    settings = db.query(Setting).all()
    
    return ConfigurationResponse(
        watch_paths=[
            WatchPathResponse(
                id=p.id,
                path=p.path,
                enabled=p.enabled,
                include_subdirectories=p.include_subdirectories,
                created_at=p.created_at.isoformat() if p.created_at else None,
                updated_at=p.updated_at.isoformat() if p.updated_at else None
            )
            for p in watch_paths
        ],
        settings={s.key: s.value for s in settings}
    )