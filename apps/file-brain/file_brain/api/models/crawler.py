"""
API request/response models for crawl functionality
"""

from typing import Any, Dict, Optional

from pydantic import BaseModel, Field


# Backward compatibility models
class CrawlerStatus(BaseModel):
    """Crawl status information"""

    running: bool
    job_type: Optional[str] = None  # "crawl", "monitor", or "crawl+monitor"
    start_time: Optional[int] = None  # Unix timestamp in ms
    elapsed_time: Optional[int] = None  # Seconds
    discovery_progress: int = 0  # 0-100
    indexing_progress: int = 0  # 0-100
    verification_progress: int = 0  # 0-100
    files_discovered: int = 0
    files_indexed: int = 0
    files_skipped: int = 0
    files_error: int = 0
    orphan_count: int = 0
    queue_size: int = 0
    estimated_completion: Optional[int] = None  # Unix timestamp in ms


class CrawlerStats(BaseModel):
    """Crawler statistics"""

    files_discovered: int = 0
    files_indexed: int = 0
    files_error: int = 0
    files_deleted: int = 0
    files_orphaned: int = 0
    queue_size: int = 0
    last_activity: Optional[int] = None


class CrawlerStatusResponse(BaseModel):
    """Response for crawl status endpoint"""

    status: Dict[str, Any]  # Can be CrawlerStatus or dictionary
    stats: Optional[CrawlerStats] = None
    timestamp: int


# Enhanced models
class CrawlStatus(BaseModel):
    """Enhanced crawl status information"""

    running: bool
    job_type: Optional[str] = None  # "crawl", "monitor", or "crawl+monitor"
    start_time: Optional[int] = None  # Unix timestamp in ms
    elapsed_time: Optional[int] = None  # Seconds
    discovery_progress: int = 0  # 0-100
    indexing_progress: int = 0  # 0-100
    verification_progress: int = 0  # 0-100
    files_discovered: int = 0
    files_indexed: int = 0
    files_skipped: int = 0
    files_error: int = 0
    orphan_count: int = 0
    queue_size: int = 0
    estimated_completion: Optional[int] = None  # Unix timestamp in ms


class CrawlStatusResponse(BaseModel):
    """Response for crawl status endpoint"""

    status: Dict[str, Any]  # Can be CrawlStatus or dictionary
    timestamp: int


class WatchPathCreateRequest(BaseModel):
    """Request to add a single watch path"""

    path: str = Field(..., description="Path to add")
    include_subdirectories: bool = Field(
        default=True,
        description="Whether to include subdirectories",
    )
    enabled: bool = Field(default=True, description="Whether path should be enabled")
    is_excluded: bool = Field(default=False, description="Whether path should be excluded from indexing")
    file_type_filter: Optional[Dict[str, Any]] = Field(
        default=None,
        description="File type filter configuration (only for included folders)",
    )

    @classmethod
    def model_validate(cls, value):
        """Custom validation for file type filter"""
        instance = super().model_validate(value)

        # If file_type_filter is provided, validate its structure
        if instance.file_type_filter is not None:
            # Only allow filter for included folders
            if instance.is_excluded:
                raise ValueError("file_type_filter cannot be used with excluded folders")

            # Validate structure
            if "mode" not in instance.file_type_filter or "extensions" not in instance.file_type_filter:
                raise ValueError("file_type_filter must contain 'mode' and 'extensions'")

            # Validate mode
            if instance.file_type_filter["mode"] not in ["include", "exclude"]:
                raise ValueError("file_type_filter mode must be 'include' or 'exclude'")

            # Validate extensions
            if not isinstance(instance.file_type_filter["extensions"], list):
                raise ValueError("file_type_filter extensions must be a list")

            for ext in instance.file_type_filter["extensions"]:
                if not isinstance(ext, str) or not ext.startswith("."):
                    raise ValueError(f"Invalid extension '{ext}': extensions must start with '.'")

        return instance


class ClearIndexesResponse(BaseModel):
    """Response for clear indexes operation"""

    success: bool
    message: str
    timestamp: int


class MessageResponse(BaseModel):
    """Generic message response"""

    message: str
    success: bool = True
    timestamp: int


class JobControlRequest(BaseModel):
    """Request for job control operations"""

    force: bool = Field(default=False, description="Force operation even if risky")
