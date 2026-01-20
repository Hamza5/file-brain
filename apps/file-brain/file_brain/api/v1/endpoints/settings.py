"""
Settings management API endpoints
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from file_brain.core.logging import logger
from file_brain.database.models import get_db
from file_brain.database.repositories import SettingsRepository

router = APIRouter(prefix="/config/settings", tags=["configuration"])


class SettingRequest(BaseModel):
    key: str
    value: str
    description: str | None = None


class SettingResponse(BaseModel):
    key: str
    value: str
    description: str | None = None


@router.get("/")
def get_all_settings(db: Session = Depends(get_db)):
    """Get all settings"""
    settings_repo = SettingsRepository(db)
    settings = settings_repo.get_all_as_dict()
    return settings


@router.get("/{key}")
def get_setting(key: str, db: Session = Depends(get_db)):
    """Get a specific setting"""
    settings_repo = SettingsRepository(db)
    value = settings_repo.get_value(key)

    if value is None:
        raise HTTPException(status_code=404, detail="Setting not found")

    return {"key": key, "value": value}


@router.put("/{key}")
def update_setting(key: str, value: str, description: str | None = None, db: Session = Depends(get_db)):
    """Update a setting"""
    settings_repo = SettingsRepository(db)
    setting = settings_repo.set(key, value, description)

    logger.info(f"Updated setting via API: {key}={value}")

    return SettingResponse(key=setting.key, value=setting.value, description=setting.description)
