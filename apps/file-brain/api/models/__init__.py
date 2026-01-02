"""
API models package
"""

from .crawler import (
    # Backward compatibility
    CrawlerStatus,
    CrawlerStats,
    CrawlerStatusResponse,
    MessageResponse,
    # Enhanced models
    CrawlStatus,
    CrawlStatusResponse,
    BatchWatchPathRequest,
    BatchWatchPathResponse,
    ClearIndexesResponse,
    JobControlRequest,
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
    "BatchWatchPathRequest",
    "BatchWatchPathResponse",
    "ClearIndexesResponse",
    "JobControlRequest",
    # File event models
    "FileDiscoveredEvent",
    "FileEvent",
]
