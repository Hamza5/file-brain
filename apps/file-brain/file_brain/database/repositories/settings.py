"""
Settings repository
"""

from datetime import datetime
from typing import Any, Dict, Optional

from sqlalchemy.orm import Session

from file_brain.core.logging import logger
from file_brain.database.models.setting import Setting
from file_brain.database.repositories.base import BaseRepository


class SettingsRepository(BaseRepository[Setting]):
    """
    Repository for Setting model
    """

    def __init__(self, db: Session):
        super().__init__(Setting, db)

    def get_value(self, key: str, default: Optional[str] = None) -> Optional[str]:
        """Get setting value by key"""
        setting = self.db.query(Setting).filter(Setting.key == key).first()
        return setting.value if setting else default

    def get_bool(self, key: str, default: bool = False) -> bool:
        """Get boolean setting value"""
        value = self.get_value(key)
        if value is None:
            return default
        return value.lower() in ("true", "1", "yes", "on")

    def get_int(self, key: str, default: int = 0) -> int:
        """Get integer setting value"""
        value = self.get_value(key)
        if value is None:
            return default
        try:
            return int(value)
        except ValueError:
            return default

    def set(self, key: str, value: Any, description: Optional[str] = None) -> Setting:
        """Set setting value"""
        # Convert value to string
        if isinstance(value, bool):
            str_value = "true" if value else "false"
        else:
            str_value = str(value)

        setting = self.db.query(Setting).filter(Setting.key == key).first()

        if setting:
            setting.value = str_value
            setting.updated_at = datetime.utcnow()
            if description:
                setting.description = description
        else:
            setting = Setting(key=key, value=str_value, description=description)
            self.db.add(setting)

        self.db.commit()
        self.db.refresh(setting)
        logger.info(f"Set setting {key}={str_value}")
        return setting

    def get_all_as_dict(self) -> Dict[str, str]:
        """Get all settings as dictionary"""
        settings = self.get_all()
        return {s.key: s.value for s in settings}

    def initialize_defaults(self, defaults: Dict[str, str]) -> None:
        """Initialize default settings if they don't exist"""
        for key, value in defaults.items():
            if not self.get_value(key):
                self.set(key, value)
