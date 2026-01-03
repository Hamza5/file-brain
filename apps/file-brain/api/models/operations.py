"""
Enhanced operation queue with operation types
"""

from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class OperationType(str, Enum):
    """Type of file operation"""

    CREATE = "create"  # New file discovered
    EDIT = "edit"  # File modified
    DELETE = "delete"  # File deleted


class CrawlOperation(BaseModel):
    """
    Enhanced operation for the queue
    Includes operation type, file info, and metadata
    """

    operation: OperationType
    file_path: str
    file_hash: Optional[str] = None
    file_size: Optional[int] = None
    modified_time: Optional[int] = None  # Unix timestamp in ms
    created_time: Optional[int] = None  # Unix timestamp in ms
    discovered_at: Optional[int] = None  # When file was discovered (for initial crawl ordering)

    # Additional metadata
    source: str = Field(description="Source of operation: 'crawl' or 'watch'")
    retry_count: int = 0  # For failed operations
    priority: int = 0  # Higher numbers = higher priority

    class Config:
        use_enum_values = True
