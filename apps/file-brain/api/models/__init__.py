"""
API models package
"""

from .crawler import (
    ClearIndexesResponse,
    CrawlerStats,
    # Backward compatibility
    CrawlerStatus,
    CrawlerStatusResponse,
    # Enhanced models
    CrawlStatus,
    CrawlStatusResponse,
    JobControlRequest,
    MessageResponse,
)
from .file_event import FileDiscoveredEvent, FileEvent

__all__ = [
    # Backward compatibility
    "CrawlerStatus",
    "CrawlerStats",
    "CrawlerStatusResponse",
    "MessageResponse",
    # Enhanced models
    "CrawlStatus",
    "CrawlStatusResponse",
    "ClearIndexesResponse",
    "JobControlRequest",
    # File event models
    "FileDiscoveredEvent",
    "FileEvent",
]
