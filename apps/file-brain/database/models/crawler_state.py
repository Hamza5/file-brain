"""
Crawler state model
"""

from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Integer, String

from .base import Base


class CrawlerState(Base):
    """Crawler state (singleton table with one row)"""

    __tablename__ = "crawler_state"

    id = Column(Integer, primary_key=True, default=1)  # Always 1
    crawl_job_running = Column(Boolean, default=False, nullable=False)
    crawl_job_type = Column(String, nullable=True)  # "crawl"
    crawl_job_started_at = Column(DateTime, nullable=True)

    # Monitoring state
    monitoring_active = Column(Boolean, default=False, nullable=False)

    # Progress tracking
    files_discovered = Column(Integer, default=0, nullable=False)
    files_indexed = Column(Integer, default=0, nullable=False)
    files_error = Column(Integer, default=0, nullable=False)
    files_deleted = Column(Integer, default=0, nullable=False)
    files_skipped = Column(Integer, default=0, nullable=False)  # Files already indexed
    estimated_total_files = Column(Integer, default=0, nullable=False)

    # Discovery and indexing progress
    discovery_progress = Column(Integer, default=0, nullable=False)  # Progress 0-100
    indexing_progress = Column(Integer, default=0, nullable=False)  # Progress 0-100

    # Timing and activity
    last_activity = Column(DateTime, nullable=True)
    estimated_completion = Column(DateTime, nullable=True)

    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
