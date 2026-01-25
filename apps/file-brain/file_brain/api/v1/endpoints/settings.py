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


class OcrStatusResponse(BaseModel):
    """Response model for OCRmyPDF status endpoint."""

    available: bool
    version: str | None = None
    error: str | None = None
    enabled: bool
    setting_key: str


@router.get("/")
def get_all_settings(db: Session = Depends(get_db)):
    """Get all settings"""
    settings_repo = SettingsRepository(db)
    settings = settings_repo.get_all_as_dict()
    return settings


# NOTE: This endpoint MUST be defined before /{key} to avoid route conflicts
@router.get("/ocrmypdf-status", response_model=OcrStatusResponse)
def get_ocrmypdf_status(db: Session = Depends(get_db)):
    """
    Get OCRmyPDF availability and enabled status.

    Returns whether ocrmypdf is installed, its version (if available),
    and whether OCR processing is currently enabled in settings.
    """
    from file_brain.services.ocrmypdf_service import (
        OCRMYPDF_ENABLED_KEY,
        is_ocrmypdf_available,
    )

    available, version_or_error = is_ocrmypdf_available()
    settings_repo = SettingsRepository(db)
    enabled = settings_repo.get_bool(OCRMYPDF_ENABLED_KEY, default=False)

    return OcrStatusResponse(
        available=available,
        version=version_or_error if available else None,
        error=version_or_error if not available else None,
        enabled=enabled,
        setting_key=OCRMYPDF_ENABLED_KEY,
    )


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
