"""
File event data models
"""

from enum import Enum
from typing import Optional, Dict, Any
from pydantic import BaseModel, Field


class FileEventType(str, Enum):
    """Type of file system event"""

    CREATED = "created"
    MODIFIED = "modified"
    DELETED = "deleted"


class FileEvent(BaseModel):
    """Base file event model"""

    event_type: FileEventType
    file_path: str
    timestamp: int = Field(description="Event timestamp in milliseconds")


class FileDiscoveredEvent(FileEvent):
    """File discovered/created event"""

    event_type: FileEventType = FileEventType.CREATED
    file_size: int
    modified_time: int
    created_time: int


class FileChangedEvent(FileEvent):
    """File modified event"""

    event_type: FileEventType = FileEventType.MODIFIED
    file_size: int
    modified_time: int


class FileDeletedEvent(FileEvent):
    """File deleted event"""

    event_type: FileEventType = FileEventType.DELETED


class DocumentContent(BaseModel):
    """Extracted document content"""

    content: str = Field(description="Document content")
    metadata: Dict[str, Any] = Field(
        default_factory=dict, description="Document metadata"
    )


# NOTE:
# Keeping this model only if still used by API responses elsewhere.
# It no longer reflects a DB table; Typesense is the source of truth.
class IndexedFile(BaseModel):
    """Indexed file model matching Typesense schema (Typesense-only, no local DB)."""

    id: str
    file_path: str
    file_name: str
    file_extension: str
    file_size: int
    mime_type: str
    content: str
    modified_time: int
    created_time: int
    indexed_at: int
    file_hash: str
    title: Optional[str] = None
    description: Optional[str] = None
    author: Optional[str] = None
