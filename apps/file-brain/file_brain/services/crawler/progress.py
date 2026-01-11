"""
Crawl Progress Tracking

Extracted from CrawlJobManager to follow Single Responsibility Principle.
Tracks progress for discovery, indexing, and verification phases.
"""

import time
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class DiscoveryProgress:
    """Progress tracking for file discovery"""

    total_paths: int = 0
    processed_paths: int = 0
    files_found: int = 0
    files_skipped: int = 0
    current_path: Optional[str] = None
    start_time: Optional[float] = None


@dataclass
class IndexingProgress:
    """Progress tracking for file indexing"""

    files_to_index: int = 0
    files_indexed: int = 0
    files_failed: int = 0
    current_file: Optional[str] = None
    # Chunk-level progress
    current_chunk_index: int = 0
    current_chunk_total: int = 0
    start_time: Optional[float] = None


@dataclass
class VerificationProgress:
    """Progress tracking for index verification"""

    total_indexed: int = 0
    processed_count: int = 0
    orphaned_count: int = 0
    verification_errors: int = 0
    current_file: Optional[str] = None
    is_complete: bool = False


@dataclass
class CrawlProgressTracker:
    """
    Centralized progress tracking for the crawl job.

    Consolidates discovery, indexing, and verification progress
    into a single component for cleaner separation of concerns.
    """

    discovery: DiscoveryProgress = field(default_factory=DiscoveryProgress)
    indexing: IndexingProgress = field(default_factory=IndexingProgress)
    verification: VerificationProgress = field(default_factory=VerificationProgress)

    def reset(self, total_watch_paths: int = 0):
        """Reset all progress for a new crawl."""
        self.discovery = DiscoveryProgress(
            total_paths=total_watch_paths,
            start_time=time.time(),
        )
        self.indexing = IndexingProgress(start_time=time.time())
        self.verification = VerificationProgress()

    def get_discovery_percent(self) -> float:
        """Calculate discovery progress percentage."""
        if self.discovery.total_paths == 0:
            return 0.0
        pct = (self.discovery.processed_paths / self.discovery.total_paths) * 100
        return round(min(pct, 100.0), 2)

    def get_verification_percent(self) -> float:
        """Calculate verification progress percentage."""
        if self.verification.is_complete:
            return 100.0
        if self.verification.total_indexed == 0:
            return 0.0
        pct = (self.verification.processed_count / self.verification.total_indexed) * 100
        return round(min(pct, 100.0), 2)

    def get_indexing_percent(self, discovered_files: int = 0) -> float:
        """
        Calculate indexing progress percentage per chunk.

        Args:
            discovered_files: Number of files discovered (from discoverer)
        """
        files_indexed = self.indexing.files_indexed
        total_known = max(
            discovered_files,
            self.discovery.files_found,
            self.indexing.files_to_index,
            files_indexed,
        )

        if total_known == 0:
            return 0.0

        # Calculate base progress from completed files
        progress_files = files_indexed

        # Add fractional progress from current file chunks
        if self.indexing.current_chunk_total > 0:
            # Chunk index is 0-based, so completed chunks is essentially current_chunk_index
            # (or maybe current_chunk_index + 1 if we want to show current work)
            # Let's assume current_chunk_index is the one BEING processed.
            # So completed is current_chunk_index.
            chunk_fraction = self.indexing.current_chunk_index / self.indexing.current_chunk_total
            progress_files += chunk_fraction

        pct = (progress_files / total_known) * 100
        return round(min(pct, 100.0), 2)

    def get_current_phase(self, discovered_files: int = 0) -> str:
        """Determine the current phase based on progress."""
        if not self.verification.is_complete:
            return "verifying"

        discovery_pct = self.get_discovery_percent()
        indexing_pct = self.get_indexing_percent(discovered_files)

        if discovery_pct < 100:
            return "discovering"

        if indexing_pct < 100:
            return "indexing"

        return "idle"
