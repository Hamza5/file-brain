"""
CrawlerState repository
"""

from datetime import datetime

from sqlalchemy.orm import Session

from file_brain.core.logging import logger
from file_brain.database.models.crawler_state import CrawlerState as DBCrawlerState
from file_brain.database.repositories.base import BaseRepository


class CrawlerStateRepository(BaseRepository[DBCrawlerState]):
    """
    Repository for CrawlerState model
    """

    def __init__(self, db: Session):
        super().__init__(DBCrawlerState, db)

    def get_state(self) -> DBCrawlerState:
        """Get crawler state (creates if not exists)"""
        state = self.db.query(DBCrawlerState).filter(DBCrawlerState.id == 1).first()
        if not state:
            state = DBCrawlerState(id=1)
            self.db.add(state)
            self.db.commit()
            self.db.refresh(state)
        return state

    def update_state(self, **kwargs) -> DBCrawlerState:
        """Update crawler state fields"""
        state = self.get_state()

        for key, value in kwargs.items():
            if hasattr(state, key):
                setattr(state, key, value)

        state.updated_at = datetime.utcnow()
        self.db.commit()
        self.db.refresh(state)
        return state

    def increment_stat(self, stat_name: str) -> DBCrawlerState:
        """Increment a statistics counter"""
        state = self.get_state()

        if hasattr(state, stat_name):
            current = getattr(state, stat_name)
            setattr(state, stat_name, current + 1)
            state.last_activity = datetime.utcnow()
            state.updated_at = datetime.utcnow()
            self.db.commit()
            self.db.refresh(state)

        return state

    def reset_stats(self) -> DBCrawlerState:
        """Reset all statistics"""
        state = self.get_state()
        state.files_discovered = 0
        state.files_indexed = 0
        state.files_error = 0
        state.files_deleted = 0
        state.files_skipped = 0
        state.estimated_total_files = 0
        state.discovery_progress = 0
        state.indexing_progress = 0
        state.last_activity = datetime.utcnow()
        state.updated_at = datetime.utcnow()
        self.db.commit()
        self.db.refresh(state)
        logger.info("Reset crawler statistics")
        return state
