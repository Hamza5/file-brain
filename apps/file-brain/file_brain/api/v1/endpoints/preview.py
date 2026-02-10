"""
API endpoints for file preview/thumbnail retrieval.
"""

import logging
import os

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response

from file_brain.services.thumbnail import SystemThumbnailService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/files", tags=["files"])


@router.get("/preview")
def get_file_preview(
    file_path: str = Query(..., description="Absolute path to the file"),
    max_size: int = Query(300, ge=64, le=800, description="Maximum thumbnail dimension in pixels"),
) -> Response:
    """
    Retrieve a thumbnail for the specified file from the OS cache.

    Returns a PNG image if a thumbnail is available, otherwise 404.
    """
    # Security: reject paths with directory traversal
    if ".." in file_path:
        raise HTTPException(status_code=400, detail="Invalid file path")

    # Validate file exists
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")

    if not os.path.isfile(file_path):
        raise HTTPException(status_code=400, detail="Path is not a file")

    # Try to get thumbnail from OS cache
    thumbnail_bytes = SystemThumbnailService.get_thumbnail(file_path, max_size)

    if thumbnail_bytes is None:
        raise HTTPException(status_code=404, detail="No thumbnail available")

    return Response(content=thumbnail_bytes, media_type="image/png")
