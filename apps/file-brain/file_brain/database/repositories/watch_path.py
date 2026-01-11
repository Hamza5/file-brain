"""
WatchPath repository
"""

from datetime import datetime
from typing import List, Optional

from sqlalchemy.orm import Session

from file_brain.database.models.watch_path import WatchPath
from file_brain.database.repositories.base import BaseRepository


class WatchPathRepository(BaseRepository[WatchPath]):
    """
    Repository for WatchPath model
    """

    def __init__(self, db: Session):
        super().__init__(WatchPath, db)

    def get_by_path(self, path: str) -> Optional[WatchPath]:
        """Get watch path by exact path string"""
        return self.db.query(WatchPath).filter(WatchPath.path == path).first()

    def get_enabled(self) -> List[WatchPath]:
        """Get all enabled watch paths"""
        return self.db.query(WatchPath).filter(WatchPath.enabled).all()

    def create_if_not_exists(
        self,
        path: str,
        enabled: bool = True,
        include_subdirectories: bool = True,
        is_excluded: bool = False,
    ) -> WatchPath:
        """Create a watch path if it doesn't exist"""
        existing = self.get_by_path(path)
        if existing:
            return existing

        return self.create(
            {
                "path": path,
                "enabled": enabled,
                "include_subdirectories": include_subdirectories,
                "is_excluded": is_excluded,
            }
        )

    def toggle(self, path: str, enabled: bool) -> Optional[WatchPath]:
        """Toggle enabled status of a watch path"""
        watch_path = self.get_by_path(path)
        if not watch_path:
            return None

        watch_path.enabled = enabled
        watch_path.updated_at = datetime.utcnow()
        self.db.commit()
        self.db.refresh(watch_path)
        return watch_path

    def delete_all(self) -> int:
        """Delete all watch paths"""
        count = self.db.query(WatchPath).delete()
        self.db.commit()
        return count
