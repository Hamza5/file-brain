"""
Wizard State Repository - Database operations for wizard state
"""

from datetime import datetime
from typing import Optional

from sqlalchemy.orm import Session

from file_brain.database.models.wizard_state import WizardState


class WizardStateRepository:
    """Repository for wizard state operations"""

    def __init__(self, db: Session):
        self.db = db

    def get_or_create(self) -> WizardState:
        """Get existing wizard state or create a new one"""
        state = self.db.query(WizardState).first()
        if not state:
            state = WizardState()
            self.db.add(state)
            self.db.commit()
            self.db.refresh(state)
        return state

    def get(self) -> Optional[WizardState]:
        """Get wizard state"""
        return self.db.query(WizardState).first()

    def update_docker_check(self, passed: bool) -> WizardState:
        """Update docker check status"""
        state = self.get_or_create()
        state.docker_check_passed = passed
        if passed and state.last_step_completed < 0:
            state.last_step_completed = 0
        self.db.commit()
        self.db.refresh(state)
        return state

    def update_docker_services(self, started: bool) -> WizardState:
        """Update docker services status"""
        state = self.get_or_create()
        state.docker_services_started = started
        if started and state.last_step_completed < 1:
            state.last_step_completed = 1
        self.db.commit()
        self.db.refresh(state)
        return state

    def update_collection_created(self, created: bool) -> WizardState:
        """Update collection creation status"""
        state = self.get_or_create()
        state.collection_created = created
        if created and state.last_step_completed < 2:
            state.last_step_completed = 2
        self.db.commit()
        self.db.refresh(state)
        return state

    def update_last_step(self, step: int) -> WizardState:
        """Update last completed step"""
        state = self.get_or_create()
        if step > state.last_step_completed:
            state.last_step_completed = step
        self.db.commit()
        self.db.refresh(state)
        return state

    def mark_completed(self) -> WizardState:
        """Mark wizard as completed"""
        state = self.get_or_create()
        state.wizard_completed = True
        state.completed_at = datetime.utcnow()
        state.last_step_completed = 3
        self.db.commit()
        self.db.refresh(state)
        return state

    def reset(self) -> WizardState:
        """Reset wizard state"""
        state = self.get_or_create()
        state.wizard_completed = False
        state.docker_check_passed = False
        state.docker_services_started = False
        state.collection_created = False
        state.last_step_completed = 0
        state.completed_at = None
        self.db.commit()
        self.db.refresh(state)
        return state

    def is_completed(self) -> bool:
        """Check if wizard is completed"""
        state = self.get()
        return state.wizard_completed if state else False

    def has_ever_completed(self) -> bool:
        """Check if wizard was ever completed (has completed_at timestamp)"""
        state = self.get()
        return state.completed_at is not None if state else False
