"""
Database service for configuration and state management
"""
from typing import Dict, List, Optional, Any
from datetime import datetime
from sqlalchemy.orm import Session

from database.models import WatchPath, Setting, CrawlerState as DBCrawlerState
from utils.logger import logger


class DatabaseService:
    """Service for database operations"""
    
    def __init__(self, db: Session):
        self.db = db
    
    # Crawler Settings
    
    def get_crawler_settings(self) -> Dict[str, Any]:
        """Get all crawler settings with defaults"""
        settings = self.get_all_settings()
        return {
            "start_monitoring": self.get_setting_bool("crawler_start_monitoring", default=True),
        }
    
    def set_crawler_setting(self, key: str, value: Any) -> Setting:
        """Set a crawler setting"""
        if isinstance(value, bool):
            str_value = "true" if value else "false"
        elif isinstance(value, (int, float)):
            str_value = str(value)
        else:
            str_value = str(value)
        
        return self.set_setting(f"crawler_{key}", str_value, f"Crawler {key} setting")
    
    def initialize_default_crawler_settings(self) -> None:
        """Initialize default crawler settings if they don't exist"""
        if self.get_setting("crawler_start_monitoring") is None:
            self.set_setting("crawler_start_monitoring", "true", "Whether to start file monitoring with crawl")
        
    
    # Watch Paths

    def list_watch_paths(self, enabled_only: bool = False) -> List[WatchPath]:
        """Return WatchPath rows for API/UI."""
        query = self.db.query(WatchPath)
        if enabled_only:
            query = query.filter(WatchPath.enabled == True)
        return query.order_by(WatchPath.id.asc()).all()

    def get_watch_paths(self, enabled_only: bool = True) -> List[str]:
        """Get list of watch path strings (legacy helper)."""
        paths = self.list_watch_paths(enabled_only=enabled_only)
        return [p.path for p in paths]

    def add_watch_path(self, path: str, enabled: bool = True, include_subdirectories: bool = True) -> WatchPath:
        """Add a new watch path."""
        existing = self.db.query(WatchPath).filter(WatchPath.path == path).first()
        if existing:
            raise ValueError(f"Watch path already exists: {path}")

        watch_path = WatchPath(path=path, enabled=enabled, include_subdirectories=include_subdirectories)
        self.db.add(watch_path)
        self.db.commit()
        self.db.refresh(watch_path)
        logger.info(f"Added watch path: {path}")
        return watch_path

    def remove_watch_path(self, path: str) -> bool:
        """Remove a watch path by path string."""
        watch_path = self.db.query(WatchPath).filter(WatchPath.path == path).first()
        if not watch_path:
            return False

        self.db.delete(watch_path)
        self.db.commit()
        logger.info(f"Removed watch path: {path}")
        return True

    def toggle_watch_path(self, path: str, enabled: bool) -> Optional[WatchPath]:
        """Enable/disable a watch path by path string."""
        watch_path = self.db.query(WatchPath).filter(WatchPath.path == path).first()
        if not watch_path:
            return None

        watch_path.enabled = enabled
        watch_path.updated_at = datetime.utcnow()
        self.db.commit()
        self.db.refresh(watch_path)
        logger.info(f"Toggled watch path {path}: enabled={enabled}")
        return watch_path

    def get_watch_path_by_path(self, path: str) -> Optional[WatchPath]:
        """Get watch path by exact path."""
        return self.db.query(WatchPath).filter(WatchPath.path == path).first()

    def create_watch_path(self, path: str, enabled: bool = True, include_subdirectories: bool = True) -> WatchPath:
        """Create a new watch path (alias for add_watch_path)."""
        return self.add_watch_path(path, enabled=enabled, include_subdirectories=include_subdirectories)

    def update_watch_path(self, path_id: int, **kwargs) -> Optional[WatchPath]:
        """Update an existing watch path by ID."""
        watch_path = self.db.query(WatchPath).filter(WatchPath.id == path_id).first()
        if not watch_path:
            return None

        for key, value in kwargs.items():
            if hasattr(watch_path, key):
                setattr(watch_path, key, value)

        watch_path.updated_at = datetime.utcnow()
        self.db.commit()
        self.db.refresh(watch_path)
        logger.info(f"Updated watch path {path_id}")
        return watch_path

    def delete_watch_path(self, path_id: int) -> bool:
        """Delete a watch path by ID."""
        watch_path = self.db.query(WatchPath).filter(WatchPath.id == path_id).first()
        if not watch_path:
            return False

        self.db.delete(watch_path)
        self.db.commit()
        logger.info(f"Deleted watch path {path_id}")
        return True

    def remove_all_watch_paths(self) -> int:
        """Remove all watch paths and return count of removed paths"""
        count = self.db.query(WatchPath).delete()
        self.db.commit()
        logger.info(f"Removed all watch paths: {count} paths deleted")
        return count
    
    # Settings
    
    def get_setting(self, key: str, default: Optional[str] = None) -> Optional[str]:
        """Get a setting value"""
        setting = self.db.query(Setting).filter(Setting.key == key).first()
        return setting.value if setting else default
    
    def get_setting_bool(self, key: str, default: bool = False) -> bool:
        """Get a boolean setting"""
        value = self.get_setting(key)
        if value is None:
            return default
        return value.lower() in ("true", "1", "yes", "on")
    
    def get_setting_int(self, key: str, default: int = 0) -> int:
        """Get an integer setting"""
        value = self.get_setting(key)
        if value is None:
            return default
        try:
            return int(value)
        except ValueError:
            return default
    
    def set_setting(self, key: str, value: str, description: Optional[str] = None) -> Setting:
        """Set a setting value"""
        setting = self.db.query(Setting).filter(Setting.key == key).first()
        
        if setting:
            setting.value = value
            setting.updated_at = datetime.utcnow()
            if description:
                setting.description = description
        else:
            setting = Setting(key=key, value=value, description=description)
            self.db.add(setting)
        
        self.db.commit()
        self.db.refresh(setting)
        logger.info(f"Set setting {key}={value}")
        return setting
    
    def get_all_settings(self) -> dict:
        """Get all settings as dictionary"""
        settings = self.db.query(Setting).all()
        return {s.key: s.value for s in settings}
    
    # Crawler State
    
    def get_crawler_state(self) -> DBCrawlerState:
        """Get crawler state (creates if not exists)"""
        state = self.db.query(DBCrawlerState).filter(DBCrawlerState.id == 1).first()
        if not state:
            state = DBCrawlerState(id=1)
            self.db.add(state)
            self.db.commit()
            self.db.refresh(state)
        return state
    
    def update_crawler_state(self, **kwargs) -> DBCrawlerState:
        """Update crawler state fields"""
        state = self.get_crawler_state()
        
        for key, value in kwargs.items():
            if hasattr(state, key):
                setattr(state, key, value)
        
        state.updated_at = datetime.utcnow()
        self.db.commit()
        self.db.refresh(state)
        return state
    
    def increment_stat(self, stat_name: str) -> DBCrawlerState:
        """Increment a statistics counter"""
        state = self.get_crawler_state()
        
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
        state = self.get_crawler_state()
        state.files_discovered = 0
        state.files_indexed = 0
        state.files_error = 0
        state.files_deleted = 0
        state.last_activity = datetime.utcnow()
        state.updated_at = datetime.utcnow()
        self.db.commit()
        self.db.refresh(state)
        logger.info("Reset crawler statistics")
        return state