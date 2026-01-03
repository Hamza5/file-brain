"""
Watch path model
"""

from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Integer, String

from .base import Base


class WatchPath(Base):
    """Watch paths configuration"""

    __tablename__ = "watch_paths"

    id = Column(Integer, primary_key=True, index=True)
    path = Column(String, unique=True, nullable=False, index=True)
    enabled = Column(Boolean, default=True, nullable=False)
    include_subdirectories = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    is_excluded = Column(Boolean, default=False, nullable=False)
