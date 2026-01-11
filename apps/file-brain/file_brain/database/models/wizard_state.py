"""
Wizard State Model - Tracks initialization wizard completion status
"""

from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Integer

from file_brain.database.models import Base


class WizardState(Base):
    """Track initialization wizard state"""

    __tablename__ = "wizard_state"

    id = Column(Integer, primary_key=True, autoincrement=True)
    wizard_completed = Column(Boolean, default=False, nullable=False)
    docker_check_passed = Column(Boolean, default=False, nullable=False)
    docker_services_started = Column(Boolean, default=False, nullable=False)
    collection_created = Column(Boolean, default=False, nullable=False)
    last_step_completed = Column(Integer, default=0, nullable=False)
    completed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    def to_dict(self):
        """Convert to dictionary"""
        return {
            "id": self.id,
            "wizard_completed": self.wizard_completed,
            "docker_check_passed": self.docker_check_passed,
            "docker_services_started": self.docker_services_started,
            "collection_created": self.collection_created,
            "last_step_completed": self.last_step_completed,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
