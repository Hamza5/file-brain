"""
Enhanced operation queue with operation types
"""

from enum import Enum
from typing import Optional
from pydantic import BaseModel, Field
from datetime import datetime


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
    discovered_at: Optional[int] = (
        None  # When file was discovered (for initial crawl ordering)
    )

    # Additional metadata
    source: str = Field(description="Source of operation: 'crawl' or 'watch'")
    retry_count: int = 0  # For failed operations
    priority: int = 0  # Higher numbers = higher priority

    class Config:
        use_enum_values = True


class BatchOperation(BaseModel):
    """Batch operation for multiple files"""

    operations: list[CrawlOperation]
    batch_id: str
    source: str = "batch"
    created_at: int = Field(
        default_factory=lambda: int(datetime.now().timestamp() * 1000)
    )


class OperationResult(BaseModel):
    """Result of processing an operation"""

    operation_id: str
    success: bool
    error_message: Optional[str] = None
    processed_at: int = Field(
        default_factory=lambda: int(datetime.now().timestamp() * 1000)
    )
    processing_time_ms: Optional[int] = None
    file_path: str
    operation: OperationType
